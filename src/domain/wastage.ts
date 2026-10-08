const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function expectedFabric(targetQty: number, stdFabricYards: number): number {
  return round2(targetQty * stdFabricYards);
}

/** Fabric Wastage % = ((Actual Fabric Used - Expected Fabric) / Expected Fabric) x 100 */
export function wastagePct(actualYards: number, expectedYards: number): number {
  if (expectedYards <= 0) throw new Error("Expected fabric must be > 0");
  return round2(((actualYards - expectedYards) / expectedYards) * 100);
}
