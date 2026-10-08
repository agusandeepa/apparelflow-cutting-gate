import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";
import { cuttingOrders, verificationLogs } from "@/db/schema";
import { HttpError } from "@/server/errors";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Test 2 - an order with a RED (shortage) component blocks approval", () => {
  it("returns 422 and leaves the order PENDING_VERIFICATION", async () => {
    const o = await env.pendingOrder(50);
    const counted = await env.countAll(o.id, { "Sleeve Cuffs": 99 }); // expected 100 -> RED
    expect(counted.items.find((i) => i.componentName === "Sleeve Cuffs")!.status).toBe("RED");
    expect(counted.summary.canApprove).toBe(false);

    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toBeInstanceOf(HttpError);

    const [row] = await env.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, o.id));
    expect(row.status).toBe("PENDING_VERIFICATION");
    const logs = await env.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, o.id));
    expect(logs).toHaveLength(0);
  });

  it("returns 422 when components are uncounted / missing", async () => {
    const o = await env.pendingOrder(20);
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
    // count only one component, the rest are still missing
    const t = await verification.getTerminal(env.verifier, o.id);
    await verification.saveCounts(env.verifier, o.id, { counts: [{ componentId: t.items[0].componentId, actualQty: t.items[0].expectedQty }] });
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
  });

  it("a zero count is a shortage (RED), not 'missing data'", async () => {
    const o = await env.pendingOrder(10);
    const c = await env.countAll(o.id, { "Collar & Stand": 0 });
    expect(c.items.find((i) => i.componentName === "Collar & Stand")!.status).toBe("RED");
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
  });

  it("cannot be bypassed by tampering with the stored status (server recomputes from counts)", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id, { "Sleeve Cuffs": 5 }); // expected 20 -> RED
    // an attacker/bug flips the stored traffic-light to GREEN directly in the DB
    await env.client.exec(`UPDATE verification_items SET status='GREEN' WHERE order_id=${o.id}`);
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
  });

  it("a rejected+re-submitted batch must be counted again from scratch", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id, { "Sleeve Cuffs": 1 });
    await verification.reject(env.verifier, o.id, { reason: "Cuffs short, re-cut" });
    const { submitOrder } = await import("@/server/orders");
    await submitOrder(env.supervisor, o.id);
    const t = await verification.getTerminal(env.verifier, o.id);
    expect(t.items.every((i) => i.actualQty === null)).toBe(true);
    await expect(verification.approve(env.verifier, o.id, {})).rejects.toMatchObject({ status: 422 });
  });
});
