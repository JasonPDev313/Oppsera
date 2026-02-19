/**
 * Client-side receiving calculations — mirrors backend services for real-time previews.
 * Pure functions, no DB or framework deps.
 *
 * Source of truth: packages/modules/inventory/src/services/
 * These are preview-only; the server recomputes everything on post (Rule VM-5).
 */

// ── Rounding ──────────────────────────────────────────────────────

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Shipping Allocation ───────────────────────────────────────────

export type FreightMode = 'expense' | 'allocate';
export type AllocationMethod = 'by_cost' | 'by_qty' | 'by_weight' | 'by_volume' | 'manual' | 'none';

interface AllocLine {
  id: string;
  productCost: number;
  quantity: number;
  weight: number | null;
  volume: number | null;
}

/**
 * Allocate shipping cost across lines. Returns Map<lineId, allocatedAmount>.
 * Sum of allocated amounts MUST exactly equal shippingCost (penny-perfect).
 *
 * Uses remainder distribution: round to 4dp, distribute leftover to largest lines first.
 * Mirrors: packages/modules/inventory/src/services/shipping-allocation.ts
 */
export function allocateShipping(
  lines: AllocLine[],
  shippingCost: number,
  method: AllocationMethod,
  manualAllocations?: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();

  if (lines.length === 0 || shippingCost === 0 || method === 'none') {
    for (const line of lines) result.set(line.id, 0);
    return result;
  }

  // Determine proportional basis per line
  let basisMap: Map<string, number>;
  switch (method) {
    case 'by_cost':
      basisMap = new Map(lines.map((l) => [l.id, l.productCost]));
      break;
    case 'by_qty':
      basisMap = new Map(lines.map((l) => [l.id, l.quantity]));
      break;
    case 'by_weight': {
      const hasWeight = lines.some((l) => l.weight !== null && l.weight > 0);
      basisMap = hasWeight
        ? new Map(lines.map((l) => [l.id, l.weight ?? 0]))
        : new Map(lines.map((l) => [l.id, l.quantity]));
      break;
    }
    case 'by_volume': {
      const hasVolume = lines.some((l) => l.volume !== null && l.volume > 0);
      basisMap = hasVolume
        ? new Map(lines.map((l) => [l.id, l.volume ?? 0]))
        : new Map(lines.map((l) => [l.id, l.quantity]));
      break;
    }
    case 'manual': {
      if (!manualAllocations || manualAllocations.size === 0) {
        basisMap = new Map(lines.map((l) => [l.id, 1]));
        break;
      }
      let manualSum = 0;
      for (const line of lines) {
        const manual = manualAllocations.get(line.id) ?? 0;
        result.set(line.id, roundTo4(manual));
        manualSum = roundTo4(manualSum + roundTo4(manual));
      }
      const manualRemainder = roundTo4(shippingCost - manualSum);
      if (Math.abs(manualRemainder) >= 0.00005) {
        const sorted = [...lines].sort(
          (a, b) => b.productCost - a.productCost || a.id.localeCompare(b.id),
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

  const totalBasis = Array.from(basisMap.values()).reduce((s, v) => s + v, 0);

  // Edge case: all zero basis → equal split with remainder distribution
  if (totalBasis === 0) {
    const equalShare = roundTo4(shippingCost / lines.length);
    let remaining = roundTo4(shippingCost);
    const sorted = [...lines].sort(
      (a, b) => b.productCost - a.productCost || a.id.localeCompare(b.id),
    );
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

  // Proportional allocation
  const rawAllocs = lines.map((l) => ({
    id: l.id,
    amount: roundTo4((basisMap.get(l.id)! / totalBasis) * shippingCost),
  }));

  const allocatedSum = rawAllocs.reduce((s, a) => roundTo4(s + a.amount), 0);
  let remainder = roundTo4(shippingCost - allocatedSum);

  // Distribute remainder: largest lines first (by productCost DESC, id ASC)
  const sorted = [...rawAllocs].sort((a, b) => {
    const lineA = lines.find((l) => l.id === a.id)!;
    const lineB = lines.find((l) => l.id === b.id)!;
    const diff = lineB.productCost - lineA.productCost;
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const increment = remainder > 0 ? 0.0001 : -0.0001;
  let idx = 0;
  while (Math.abs(remainder) >= 0.00005) {
    sorted[idx % sorted.length]!.amount = roundTo4(
      sorted[idx % sorted.length]!.amount + increment,
    );
    remainder = roundTo4(remainder - increment);
    idx++;
  }

  for (const alloc of sorted) result.set(alloc.id, alloc.amount);
  return result;
}

// ── Weighted Average Cost ─────────────────────────────────────────

/**
 * Compute new weighted average cost after receiving.
 * Mirrors: packages/modules/inventory/src/services/costing.ts
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

// ── Grid Computation ──────────────────────────────────────────────

export interface GridLineInput {
  id: string;
  itemName: string;
  itemSku: string | null;
  quantityReceived: number;
  unitCost: number;
  weight: number | null;
  volume: number | null;
  /** Ratio of baseQty to quantityReceived, derived on initial load. */
  conversionFactor: number;
  /** From server costPreview — on-hand at the location before this receipt. */
  currentOnHand: number;
  /** From server costPreview — current weighted avg cost. */
  currentUnitCost: number;
}

export interface ComputedGridLine {
  id: string;
  itemName: string;
  itemSku: string | null;
  quantityReceived: number;
  currentOnHand: number;
  totalOnHand: number;
  unitCost: number;
  productCost: number;
  currentUnitCost: number;
  allocatedShipping: number;
  newWeightedCost: number;
}

export interface GridTotals {
  totalQtyReceived: number;
  productCostTotal: number;
  shippingTotal: number;
  invoiceTotal: number;
}

export interface GridResult {
  lines: ComputedGridLine[];
  totals: GridTotals;
}

/**
 * Compute all derived columns for the receiving grid.
 * Called on every local state change for instant updates.
 */
export function computeGrid(
  lines: GridLineInput[],
  shippingCost: number,
  allocationMethod: AllocationMethod,
  freightMode: FreightMode = 'allocate',
): GridResult {
  // Step 1: product cost per line
  const withCost = lines.map((l) => ({
    ...l,
    productCost: roundTo4(l.quantityReceived * l.unitCost),
  }));

  // Step 2: shipping allocation (use base qty to match backend)
  // In EXPENSE mode, shipping goes to GL not to item costs → allocate 0
  const effectiveShipping = freightMode === 'expense' ? 0 : shippingCost;
  const allocLines: AllocLine[] = withCost.map((l) => ({
    id: l.id,
    productCost: l.productCost,
    quantity: roundTo4(l.quantityReceived * l.conversionFactor),
    weight: l.weight,
    volume: l.volume,
  }));
  const allocations = allocateShipping(allocLines, effectiveShipping, allocationMethod);

  // Step 3: landed cost + weighted avg preview per line
  const computedLines: ComputedGridLine[] = withCost.map((l) => {
    const allocated = allocations.get(l.id) ?? 0;
    const landedTotal = roundTo4(l.productCost + allocated);
    const baseQty = roundTo4(l.quantityReceived * l.conversionFactor);
    const landedUnitCost = baseQty > 0 ? roundTo4(landedTotal / baseQty) : 0;
    const totalOnHand = roundTo4(l.currentOnHand + baseQty);
    const newWeightedCost = weightedAvgCost(
      l.currentOnHand,
      l.currentUnitCost,
      baseQty,
      landedUnitCost,
    );

    return {
      id: l.id,
      itemName: l.itemName,
      itemSku: l.itemSku,
      quantityReceived: l.quantityReceived,
      currentOnHand: l.currentOnHand,
      totalOnHand,
      unitCost: l.unitCost,
      productCost: l.productCost,
      currentUnitCost: l.currentUnitCost,
      allocatedShipping: allocated,
      newWeightedCost,
    };
  });

  // Step 4: totals
  const totalQtyReceived = computedLines.reduce((s, l) => s + l.quantityReceived, 0);
  const productCostTotal = computedLines.reduce((s, l) => roundTo4(s + l.productCost), 0);

  return {
    lines: computedLines,
    totals: {
      totalQtyReceived,
      productCostTotal,
      shippingTotal: shippingCost,
      invoiceTotal: roundTo4(productCostTotal + shippingCost),
    },
  };
}
