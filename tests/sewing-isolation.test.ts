import { beforeAll, describe, expect, it } from "vitest";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";
import * as ordersSvc from "@/server/orders";
import * as sewingSvc from "@/server/sewing";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Test 5 - unapproved orders never appear in the Sewing Queue query", () => {
  it("only VERIFIED orders are returned (not in-progress / pending / rejected / shortage)", async () => {
    const inProgress = await ordersSvc.createOrder(env.supervisor, { recipeId: env.blouse.id, targetQty: 5, fabricRollId: "FAB-ROLL-001", actualFabricYds: 9 });

    const pending = await env.pendingOrder(5);

    const rejected = await env.pendingOrder(5);
    await verification.reject(env.verifier, rejected.id, { reason: "Defective fabric" });

    const shortage = await env.pendingOrder(5);
    await env.countAll(shortage.id, { "Sleeve Cuffs": 1 });
    await expect(verification.approve(env.verifier, shortage.id, {})).rejects.toMatchObject({ status: 422 });

    const good = await env.pendingOrder(5);
    await env.countAll(good.id);
    await verification.approve(env.verifier, good.id, {});

    const queue = await sewingSvc.sewingQueue(env.sewing);
    const ids = queue.map((q) => q.id);
    expect(ids).toEqual([good.id]);
    for (const bad of [inProgress.id, pending.id, rejected.id, shortage.id]) expect(ids).not.toContain(bad);
    expect(queue.every((q) => q.status === "VERIFIED")).toBe(true);
  });

  it("the queue function accepts no client input, so extra args cannot widen the filter", async () => {
    const pending = await env.pendingOrder(5);
    // @ts-expect-error - deliberately passing junk to prove it is ignored
    const q = await sewingSvc.sewingQueue(env.sewing, { status: "PENDING_VERIFICATION", all: true });
    expect(q.map((x) => x.id)).not.toContain(pending.id);
  });

  it("start sewing works only for VERIFIED batches, once", async () => {
    const pending = await env.pendingOrder(5);
    await expect(sewingSvc.startSewing(env.sewing, pending.id)).rejects.toMatchObject({ status: 404 });

    const good = await env.pendingOrder(5);
    await env.countAll(good.id);
    await verification.approve(env.verifier, good.id, {});
    const r = await sewingSvc.startSewing(env.sewing, good.id);
    expect(r.startedBy).toBe("Dilani Silva");
    await expect(sewingSvc.startSewing(env.sewing, good.id)).rejects.toMatchObject({ status: 422 });
    // still VERIFIED in the queue, now flagged as started
    const q = await sewingSvc.sewingQueue(env.sewing);
    expect(q.find((x) => x.id === good.id)!.sewing.started).toBe(true);
  });
});
