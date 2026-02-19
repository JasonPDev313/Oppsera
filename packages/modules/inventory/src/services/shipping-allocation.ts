/**
 * Shipping cost allocation — distributes a receipt's shipping cost
 * across its line items using one of four methods.
 *
 * Pure function — no DB, no framework deps. Easy to unit-test.
 */

export interface AllocationLine {
  id: string;
  extendedCost: number;
  baseQty: number;
  weight: number | null;
  volume: number | null;
}

export type AllocationMethod = 'by_cost' | 'by_qty' | 'by_weight' | 'by_volume' | 'manual' | 'none';

/**
 * Allocate shipping cost to lines. Returns a map of lineId → allocated amount.
 * Sum of all allocated amounts MUST exactly equal shippingCost.
 *
 * Remainder distribution: round to 4dp, distribute remainder (penny rounding)
 * to lines ordered by extendedCost DESC, tie-break by id ASC.
 */
export function allocateShipping(
  lines: AllocationLine[],
  shippingCost: number,
  method: AllocationMethod,
  manualAllocations?: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();

  if (lines.length === 0 || shippingCost === 0 || method === 'none') {
    for (const line of lines) {
      result.set(line.id, 0);
    }
    return result;
  }

  // Determine the proportional basis for each line
  let basis: Map<string, number>;

  switch (method) {
    case 'by_cost':
      basis = new Map(lines.map((l) => [l.id, l.extendedCost]));
      break;
    case 'by_qty':
      basis = new Map(lines.map((l) => [l.id, l.baseQty]));
      break;
    case 'by_weight': {
      const hasWeight = lines.some((l) => l.weight !== null && l.weight > 0);
      if (hasWeight) {
        basis = new Map(lines.map((l) => [l.id, l.weight ?? 0]));
      } else {
        // Fallback to by_qty if no weights
        basis = new Map(lines.map((l) => [l.id, l.baseQty]));
      }
      break;
    }
    case 'by_volume': {
      const hasVolume = lines.some((l) => l.volume !== null && l.volume > 0);
      if (hasVolume) {
        basis = new Map(lines.map((l) => [l.id, l.volume ?? 0]));
      } else {
        // Fallback to by_qty if no volumes
        basis = new Map(lines.map((l) => [l.id, l.baseQty]));
      }
      break;
    }
    case 'manual': {
      // Manual allocations: use user-provided amounts, distribute any remainder
      if (!manualAllocations || manualAllocations.size === 0) {
        // No manual values → equal split
        basis = new Map(lines.map((l) => [l.id, 1]));
        break;
      }
      // Apply manual allocations directly
      let manualSum = 0;
      for (const line of lines) {
        const manual = manualAllocations.get(line.id) ?? 0;
        result.set(line.id, roundTo4(manual));
        manualSum = roundTo4(manualSum + roundTo4(manual));
      }
      // Distribute any remainder to the line with highest extendedCost
      const manualRemainder = roundTo4(shippingCost - manualSum);
      if (Math.abs(manualRemainder) >= 0.00005) {
        const sorted = [...lines].sort(
          (a, b) => b.extendedCost - a.extendedCost || a.id.localeCompare(b.id),
        );
        const topId = sorted[0]!.id;
        result.set(topId, roundTo4((result.get(topId) ?? 0) + manualRemainder));
      }
      return result;
    }
    default:
      for (const line of lines) result.set(line.id, 0);
      return result;
  }

  const totalBasis = Array.from(basis.values()).reduce((sum, v) => sum + v, 0);

  // Edge case: total basis is 0 (all zero costs/quantities) → equal split
  if (totalBasis === 0) {
    const equalShare = roundTo4(shippingCost / lines.length);
    let remaining = roundTo4(shippingCost);
    const sorted = [...lines].sort((a, b) => b.extendedCost - a.extendedCost || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) {
      if (i === sorted.length - 1) {
        result.set(sorted[i]!.id, remaining);
      } else {
        result.set(sorted[i]!.id, equalShare);
        remaining = roundTo4(remaining - equalShare);
      }
    }
    return result;
  }

  // Proportional allocation with remainder distribution
  const rawAllocations: { id: string; amount: number }[] = lines.map((l) => ({
    id: l.id,
    amount: roundTo4((basis.get(l.id)! / totalBasis) * shippingCost),
  }));

  const allocatedSum = rawAllocations.reduce((sum, a) => roundTo4(sum + a.amount), 0);
  let remainder = roundTo4(shippingCost - allocatedSum);

  // Distribute remainder: order by extendedCost DESC, tie-break by id ASC
  const sorted = [...rawAllocations].sort((a, b) => {
    const lineA = lines.find((l) => l.id === a.id)!;
    const lineB = lines.find((l) => l.id === b.id)!;
    const costDiff = lineB.extendedCost - lineA.extendedCost;
    return costDiff !== 0 ? costDiff : a.id.localeCompare(b.id);
  });

  const increment = remainder > 0 ? 0.0001 : -0.0001;
  let idx = 0;
  while (Math.abs(remainder) >= 0.00005) {
    sorted[idx % sorted.length]!.amount = roundTo4(sorted[idx % sorted.length]!.amount + increment);
    remainder = roundTo4(remainder - increment);
    idx++;
  }

  for (const alloc of sorted) {
    result.set(alloc.id, alloc.amount);
  }

  return result;
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
