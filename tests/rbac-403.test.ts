import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";
import * as ordersSvc from "@/server/orders";
import * as sewingSvc from "@/server/sewing";
import { cuttingOrders } from "@/db/schema";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Test 4 - non-verifier roles get 403 Forbidden when attempting verification", () => {
  it("cutting_supervisor cannot approve, reject or count (403)", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id); // everything GREEN, so ONLY the role stands in the way
    await expect(verification.approve(env.supervisor, o.id, {})).rejects.toMatchObject({ status: 403 });
    await expect(verification.reject(env.supervisor, o.id, { reason: "should not be allowed" })).rejects.toMatchObject({ status: 403 });
    await expect(verification.saveCounts(env.supervisor, o.id, { counts: [{ componentId: 1, actualQty: 1 }] })).rejects.toMatchObject({ status: 403 });
    const [row] = await env.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, o.id));
    expect(row.status).toBe("PENDING_VERIFICATION");
  });

  it("sewing_supervisor cannot approve or reject (403)", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id);
    await expect(verification.approve(env.sewing, o.id, {})).rejects.toMatchObject({ status: 403 });
    await expect(verification.reject(env.sewing, o.id, { reason: "should not be allowed" })).rejects.toMatchObject({ status: 403 });
  });

  it("unauthenticated requests get 401", async () => {
    const o = await env.pendingOrder(10);
    await expect(verification.approve(env.anonymous, o.id, {})).rejects.toMatchObject({ status: 401 });
    await expect(sewingSvc.sewingQueue(env.anonymous)).rejects.toMatchObject({ status: 401 });
  });

  it("separation of duties for the other roles too", async () => {
    // verifier cannot create orders or see the sewing queue
    await expect(ordersSvc.createOrder(env.verifier, { recipeId: env.blouse.id, targetQty: 5, fabricRollId: "FAB-ROLL-1", actualFabricYds: 9 }))
      .rejects.toMatchObject({ status: 403 });
    await expect(sewingSvc.sewingQueue(env.verifier)).rejects.toMatchObject({ status: 403 });
    // supervisor cannot see the sewing queue or start sewing
    await expect(sewingSvc.sewingQueue(env.supervisor)).rejects.toMatchObject({ status: 403 });
    await expect(sewingSvc.startSewing(env.supervisor, 1)).rejects.toMatchObject({ status: 403 });
    // sewing supervisor cannot create orders / list cutting orders
    await expect(ordersSvc.createOrder(env.sewing, { recipeId: env.blouse.id, targetQty: 5, fabricRollId: "FAB-ROLL-1", actualFabricYds: 9 }))
      .rejects.toMatchObject({ status: 403 });
    await expect(ordersSvc.listOrders(env.sewing)).rejects.toMatchObject({ status: 403 });
  });

  it("a verifier id sent in the body is rejected (identity only comes from the session)", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id);
    await expect(verification.approve(env.verifier, o.id, { verifierId: 1, timestamp: "2000-01-01" })).rejects.toMatchObject({ status: 400 });
  });
});
