import { describe, expect, it } from "vitest";
import { expectedQty } from "@/domain/components";
import { trafficLight } from "@/domain/trafficLight";
import { expectedFabric, wastagePct } from "@/domain/wastage";
import { canTransition } from "@/domain/stateMachine";
import { createOrderSchema, saveCountsSchema } from "@/server/validators";

describe("domain rules", () => {
  it("multiplier engine: 50 garments x 2 cuffs = 100", () => expect(expectedQty(2, 50)).toBe(100));
  it("traffic light", () => {
    expect(trafficLight(100, 100)).toBe("GREEN");
    expect(trafficLight(100, 101)).toBe("YELLOW");
    expect(trafficLight(100, 99)).toBe("RED");
    expect(trafficLight(100, 0)).toBe("RED");
  });
  it("wastage %", () => {
    expect(expectedFabric(50, 1.8)).toBe(90);
    expect(wastagePct(94.5, 90)).toBe(5);
    expect(wastagePct(85.5, 90)).toBe(-5);
  });
  it("state machine only allows the documented transitions", () => {
    expect(canTransition("IN_PROGRESS", "PENDING_VERIFICATION")).toBe(true);
    expect(canTransition("IN_PROGRESS", "VERIFIED")).toBe(false);
    expect(canTransition("REJECTED", "VERIFIED")).toBe(false);
    expect(canTransition("VERIFIED", "PENDING_VERIFICATION")).toBe(false);
  });
});

describe("defensive input guards", () => {
  const ok = { recipeId: 1, targetQty: 50, fabricRollId: "FAB-ROLL-882", actualFabricYds: 91.5 };
  it("accepts a valid order", () => expect(createOrderSchema.safeParse(ok).success).toBe(true));
  it.each([
    ["negative qty", { targetQty: -5 }],
    ["zero qty", { targetQty: 0 }],
    ["decimal qty", { targetQty: 2.5 }],
    ["string qty", { targetQty: "50" }],
    ["NaN qty", { targetQty: NaN }],
    ["null qty", { targetQty: null }],
    ["negative fabric", { actualFabricYds: -1 }],
    ["3-decimal fabric", { actualFabricYds: 1.234 }],
    ["string fabric", { actualFabricYds: "abc" }],
    ["empty roll id", { fabricRollId: "" }],
    ["roll id with spaces/symbols", { fabricRollId: "a b;--" }],
  ])("rejects %s", (_n, patch) => expect(createOrderSchema.safeParse({ ...ok, ...patch }).success).toBe(false));
  it("rejects empty payloads", () => {
    expect(createOrderSchema.safeParse({}).success).toBe(false);
    expect(createOrderSchema.safeParse(undefined).success).toBe(false);
  });
  it("counts: reject negatives, decimals, strings, duplicates", () => {
    expect(saveCountsSchema.safeParse({ counts: [{ componentId: 1, actualQty: -1 }] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [{ componentId: 1, actualQty: 1.5 }] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [{ componentId: 1, actualQty: "5" }] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [{ componentId: 1, actualQty: 1 }, { componentId: 1, actualQty: 2 }] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [{ componentId: 1, actualQty: 0 }] }).success).toBe(true);
  });
});
