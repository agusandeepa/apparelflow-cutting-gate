import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";
import * as sewingSvc from "@/server/sewing";
import { verificationLogs, cuttingOrders } from "@/db/schema";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Test 1 - all GREEN components can be approved by an authenticated Verifier", () => {
  it("approves, writes immutable audit data, and releases to the sewing queue", async () => {
    const o = await env.pendingOrder(50, env.blouse.id, 90); // expected fabric 50*1.8 = 90 -> 0% wastage
    const counted = await env.countAll(o.id);
    expect(counted.items.every((i) => i.status === "GREEN")).toBe(true);
    expect(counted.summary.canApprove).toBe(true);

    const res = await verification.approve(env.verifier, o.id, { note: "All good" });
    expect(res.status).toBe("VERIFIED");
    expect(res.verifiedBy.id).toBe(env.verifier.session!.userId);
    expect(res.wastagePct).toBe(0);

    const [log] = await env.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, o.id));
    expect(log.decision).toBe("APPROVED");
    expect(log.verifierId).toBe(env.verifier.session!.userId);   // from session
    expect(log.timestamp).toBeInstanceOf(Date);                   // from server clock
    expect(log.componentVariances).toHaveLength(5);
    expect(Number(log.wastagePct)).toBe(0);

    const queue = await sewingSvc.sewingQueue(env.sewing);
    const row = queue.find((q) => q.id === o.id)!;
    expect(row.audit.verifiedBy).toBe("Kasun Fernando");
    expect(row.items).toHaveLength(5);
    const [st] = await env.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, o.id));
    expect(st.status).toBe("VERIFIED");
  });

  it("YELLOW (excess) components do not block approval", async () => {
    const o = await env.pendingOrder(10);
    const counted = await env.countAll(o.id, { "Sleeve Cuffs": 25 }); // expected 20
    expect(counted.items.find((i) => i.componentName === "Sleeve Cuffs")!.status).toBe("YELLOW");
    const res = await verification.approve(env.verifier, o.id, {});
    expect(res.status).toBe("VERIFIED");
  });

  it("computes fabric wastage % = (actual - expected) / expected x 100", async () => {
    const o = await env.pendingOrder(50, env.blouse.id, 99); // expected 90, used 99 -> 10%
    await env.countAll(o.id);
    const res = await verification.approve(env.verifier, o.id, {});
    expect(res.wastagePct).toBe(10);
    expect(res.exceedsWastageCap).toBe(true); // cap is 5%
  });
});
