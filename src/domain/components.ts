/** Multiplier engine: 50 garments x 2 cuffs = 100 expected cut cuffs. */
export function expectedQty(piecesPerGarment: number, targetQty: number): number {
  return piecesPerGarment * targetQty;
}
