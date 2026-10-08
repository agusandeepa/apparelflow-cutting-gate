import { beforeAll, describe, expect, it } from "vitest";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Database-level defence in depth (even raw SQL cannot break the rules)", () => {
  it("cannot force an order to VERIFIED when a component is RED or the approval log is missing", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id, { "Sleeve Cuffs": 1 });
    await expect(env.client.exec(`UPDATE cutting_orders SET status='VERIFIED' WHERE id=${o.id}`)).rejects.toThrow(/HARD STOP/);
  });

  it("cannot skip states (IN_PROGRESS -> VERIFIED)", async () => {
    const { createOrder } = await import("@/server/orders");
    const o = await createOrder(env.supervisor, { recipeId: env.blouse.id, targetQty: 5, fabricRollId: "FAB-ROLL-777", actualFabricYds: 9 });
    await expect(env.client.exec(`UPDATE cutting_orders SET status='VERIFIED' WHERE id=${o.id}`)).rejects.toThrow(/Illegal status transition/);
  });

  it("verification_logs is immutable (no UPDATE / DELETE)", async () => {
    const o = await env.pendingOrder(10);
    await verification.reject(env.verifier, o.id, { reason: "Not good enough" });
    await expect(env.client.exec(`UPDATE verification_logs SET wastage_pct = 0 WHERE order_id=${o.id}`)).rejects.toThrow(/append-only/);
    await expect(env.client.exec(`DELETE FROM verification_logs WHERE order_id=${o.id}`)).rejects.toThrow(/append-only/);
  });

  it("counts of a VERIFIED order are frozen", async () => {
    const o = await env.pendingOrder(10);
    await env.countAll(o.id);
    await verification.approve(env.verifier, o.id, {});
    await expect(env.client.exec(`UPDATE verification_items SET actual_qty = 0, status='RED' WHERE order_id=${o.id}`)).rejects.toThrow(/immutable/);
    await expect(env.client.exec(`UPDATE cutting_orders SET target_qty = 1 WHERE id=${o.id}`)).rejects.toThrow(/immutable/);
  });
});
