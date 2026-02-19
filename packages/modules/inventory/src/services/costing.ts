/**
 * Costing helpers — pure functions for weighted average and last-cost methods.
 * No DB, no framework deps.
 */

/**
 * Calculate new weighted average cost after a receive.
 * Formula: (currentOnHand × currentCost + incomingQty × incomingUnitCost) / (currentOnHand + incomingQty)
 *
 * Edge cases:
 * - currentOnHand=0 → returns incomingUnitCost
 * - incomingQty=0 → returns currentCost
 */
export function weightedAvgCost(
  currentOnHand: number,
  currentCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): number {
  if (incomingQty === 0) return roundTo4(currentCost);
  if (currentOnHand <= 0) return roundTo4(incomingUnitCost);

  const totalValue = currentOnHand * currentCost + incomingQty * incomingUnitCost;
  const totalQty = currentOnHand + incomingQty;
  return roundTo4(totalValue / totalQty);
}

/**
 * Last-cost method — simply returns the incoming cost.
 */
export function lastCost(incomingUnitCost: number): number {
  return roundTo4(incomingUnitCost);
}

/**
 * Reverse weighted average cost (for void/reversal).
 * Removes the effect of a previous receive from the weighted average.
 *
 * Edge cases:
 * - afterQty <= 0 → returns currentCost (can't reverse to negative stock)
 */
export function reverseWeightedAvgCost(
  currentOnHand: number,
  currentCost: number,
  reversedQty: number,
  reversedUnitCost: number,
): number {
  const afterQty = currentOnHand - reversedQty;
  if (afterQty <= 0) return roundTo4(currentCost);

  const totalValue = currentOnHand * currentCost - reversedQty * reversedUnitCost;
  return roundTo4(totalValue / afterQty);
}

export interface CostPreview {
  newCost: number;
  newOnHand: number;
  marginPct: number | null;
}

/**
 * Preview the cost impact of receiving a quantity.
 * @param retailPrice  The item's retail price (null if unknown → margin=null)
 */
export function costPreview(
  currentOnHand: number,
  currentCost: number,
  retailPrice: number | null,
  incomingBaseQty: number,
  landedUnitCost: number,
  method: 'weighted_avg' | 'fifo' | 'standard',
): CostPreview {
  const newCost =
    method === 'weighted_avg'
      ? weightedAvgCost(currentOnHand, currentCost, incomingBaseQty, landedUnitCost)
      : method === 'standard'
        ? currentCost // standard cost doesn't change on receive
        : lastCost(landedUnitCost);

  const newOnHand = roundTo4(currentOnHand + incomingBaseQty);

  const marginPct =
    retailPrice && retailPrice > 0
      ? roundTo4(((retailPrice - newCost) / retailPrice) * 100)
      : null;

  return { newCost, newOnHand, marginPct };
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
