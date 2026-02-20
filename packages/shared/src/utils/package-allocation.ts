/**
 * Package revenue allocation service.
 *
 * Pure functions — no side effects, no DB. Safe to call from both
 * the orders command layer (addLineItem) and the frontend (preview).
 *
 * Algorithm: proportional by component extended cost, with remainder
 * distribution to the largest component (same pattern as shipping-allocation.ts).
 */

export interface ComponentAllocationInput {
  catalogItemId: string;
  itemName: string;
  itemType: string;
  qty: number;
  /** Unit price in cents for this component. Must be >= 0. */
  componentUnitPriceCents: number;
}

export interface ComponentAllocation extends ComponentAllocationInput {
  /** qty * componentUnitPriceCents */
  componentExtendedCents: number;
  /** Proportional share of package sale price, in cents. Sums exactly to packageSalePriceCents. */
  allocatedRevenueCents: number;
  /** 0–1 weight used for allocation (for display only). */
  allocationWeight: number;
}

/**
 * Compute per-component revenue allocations for a package sale.
 *
 * @param packageSalePriceCents - The package's sale price in cents (integer).
 * @param components - Component inputs with unit prices in cents.
 * @returns Array of allocations in the same order as `components`.
 *
 * @throws If `components` is empty or `packageSalePriceCents` < 0.
 *
 * Special cases:
 * - If all components have price 0, allocate equally (floor division + remainder to first).
 * - Components with price 0 get weight 0 and allocatedRevenue 0 when subtotal > 0.
 */
export function computePackageAllocations(
  packageSalePriceCents: number,
  components: ComponentAllocationInput[],
): ComponentAllocation[] {
  if (components.length === 0) {
    throw new Error('computePackageAllocations: components array must not be empty');
  }
  if (packageSalePriceCents < 0) {
    throw new Error('computePackageAllocations: packageSalePriceCents must be >= 0');
  }

  // Compute extended cost per component
  const extended = components.map((c) => ({
    ...c,
    componentExtendedCents: c.qty * c.componentUnitPriceCents,
  }));

  const componentsSubtotalCents = extended.reduce((sum, c) => sum + c.componentExtendedCents, 0);

  let allocations: number[];

  if (componentsSubtotalCents === 0) {
    // All components are zero-priced: distribute equally
    const base = Math.floor(packageSalePriceCents / components.length);
    allocations = components.map(() => base);
    const remainder = packageSalePriceCents - base * components.length;
    for (let i = 0; i < remainder; i++) {
      allocations[i]! += 1;
    }
  } else {
    // Proportional allocation
    allocations = extended.map((c) =>
      Math.round(packageSalePriceCents * (c.componentExtendedCents / componentsSubtotalCents)),
    );

    // Remainder correction: ensure exact sum
    const allocated = allocations.reduce((s, a) => s + a, 0);
    let remainder = packageSalePriceCents - allocated;

    if (remainder !== 0) {
      // Sort indices by extended cost DESC (tie-break: original index ASC) to find adjustment targets
      const sortedIndices = extended
        .map((c, i) => ({ i, ext: c.componentExtendedCents }))
        .sort((a, b) => b.ext - a.ext || a.i - b.i)
        .map((x) => x.i);

      const step = remainder > 0 ? 1 : -1;
      for (let k = 0; Math.abs(k) < Math.abs(remainder); k += step) {
        const idx = sortedIndices[Math.abs(k) % sortedIndices.length]!;
        allocations[idx]! += step;
      }
    }
  }

  return extended.map((c, i) => ({
    ...c,
    allocatedRevenueCents: allocations[i]!,
    allocationWeight:
      componentsSubtotalCents > 0
        ? c.componentExtendedCents / componentsSubtotalCents
        : 1 / components.length,
  }));
}
