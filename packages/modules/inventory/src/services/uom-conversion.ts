/**
 * UOM conversion helpers — pure functions, no DB deps.
 */

/**
 * Convert a quantity from a purchase UOM to the base UOM.
 * @param quantity  The quantity in the purchase UOM
 * @param conversionFactor  How many base units per purchase unit (1 if already base)
 */
export function toBaseQty(quantity: number, conversionFactor: number): number {
  return roundTo4(quantity * conversionFactor);
}

/**
 * Calculate the landed unit cost in base UOM terms.
 * @param landedCost  Total landed cost for the line (extended + allocated shipping)
 * @param baseQty     Total base quantity for the line
 */
export function landedUnitCost(landedCost: number, baseQty: number): number {
  if (baseQty === 0) return 0;
  return roundTo4(landedCost / baseQty);
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
