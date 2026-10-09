import type { LightStatus } from "@/db/schema";

export function trafficLight(expected: number, actual: number): LightStatus {
  if (actual === expected) return "GREEN";
  if (actual > expected) return "YELLOW";
  return "RED";
}

export function variance(expected: number, actual: number): number {
  return actual - expected;
}
