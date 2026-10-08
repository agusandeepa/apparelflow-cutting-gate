import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeEnv, type TestEnv } from "./helpers";
import * as verification from "@/server/verification";
import { cuttingOrders, verificationLogs } from "@/db/schema";

let env: TestEnv;
beforeAll(async () => { env = await makeEnv(); });

describe("Test 3 - rejecting without a reason note is refused by backend validation", () => {
  it.each([
    ["missing body", undefined],
    ["empty object", {}],
    ["empty string", { reason: "" }],
    ["whitespace only", { reason: "      " }],
    ["too short", { reason: "no" }],
    ["wrong type", { reason: 12345 }],
    ["unknown extra fields (strict)", { reason: "valid reason here", verifierId: 999 }],
  ])("%s -> 400 and the order stays PENDING_VERIFICATION", async (_label, body) => {
    const o = await env.pendingOrder(10);
    await expect(verification.reject(env.verifier, o.id, body)).rejects.toMatchObject({ status: 400 });
    const [row] = await env.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, o.id));
    expect(row.status).toBe("PENDING_VERIFICATION");
    expect(await env.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, o.id))).toHaveLength(0);
  });

  it("with a proper reason the batch is REJECTED, logged, and the supervisor can see why", async () => {
    const o = await env.pendingOrder(10);
    const res = await verification.reject(env.verifier, o.id, { reason: "Collar shortage - fabric defect" });
    expect(res.status).toBe("REJECTED");
    const { getOrder } = await import("@/server/orders");
    const seen = await getOrder(env.supervisor, o.id);
    expect(seen.status).toBe("REJECTED");
    expect(seen.latestRejection?.note).toBe("Collar shortage - fabric defect");
    expect(seen.latestRejection?.verifier).toBe("Kasun Fernando");
  });

  it("the database itself also refuses a REJECTED log without a note", async () => {
    const o = await env.pendingOrder(10);
    await expect(env.client.exec(
      `INSERT INTO verification_logs(order_id, verifier_id, decision, rejection_note, wastage_pct, component_variances)
       VALUES (${o.id}, ${env.verifier.session!.userId}, 'REJECTED', '  ', 0, '[]')`,
    )).rejects.toThrow();
  });
});
