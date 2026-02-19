/**
 * Receipt calculator — recomputes all derived fields on receipt lines.
 * Pure function orchestrating shipping allocation, UOM conversion, and landed cost.
 */

import { allocateShipping, type AllocationMethod } from './shipping-allocation';
import { toBaseQty, landedUnitCost } from './uom-conversion';

export interface ReceiptLineInput {
  id: string;
  quantityReceived: number;
  unitCost: number;
  conversionFactor: number; // 1 if already base UOM
  weight: number | null;
}

export interface ComputedReceiptLine {
  id: string;
  extendedCost: number;
  baseQty: number;
  allocatedShipping: number;
  landedCost: number;
  landedUnitCost: number;
}

/**
 * Recompute a single line's extendedCost and baseQty (before shipping allocation).
 */
export function recomputeReceiptLine(
  line: ReceiptLineInput,
): { extendedCost: number; baseQty: number } {
  const extendedCost = roundTo4(line.quantityReceived * line.unitCost);
  const baseQty = toBaseQty(line.quantityReceived, line.conversionFactor);
  return { extendedCost, baseQty };
}

/**
 * Recompute ALL lines on a receipt including shipping allocation and landed costs.
 * Returns computed fields for each line + header subtotal.
 */
export function recomputeAllLines(
  lines: ReceiptLineInput[],
  shippingCost: number,
  allocationMethod: AllocationMethod,
): { computed: ComputedReceiptLine[]; subtotal: number } {
  // Step 1: compute extendedCost and baseQty per line
  const precomputed = lines.map((line) => {
    const { extendedCost, baseQty } = recomputeReceiptLine(line);
    return { ...line, extendedCost, baseQty };
  });

  // Step 2: allocate shipping across lines
  const allocationLines = precomputed.map((p) => ({
    id: p.id,
    extendedCost: p.extendedCost,
    baseQty: p.baseQty,
    weight: p.weight,
  }));
  const allocations = allocateShipping(allocationLines, shippingCost, allocationMethod);

  // Step 3: compute landed cost per line
  const computed: ComputedReceiptLine[] = precomputed.map((p) => {
    const allocated = allocations.get(p.id) ?? 0;
    const landed = roundTo4(p.extendedCost + allocated);
    const landedUnit = landedUnitCost(landed, p.baseQty);
    return {
      id: p.id,
      extendedCost: p.extendedCost,
      baseQty: p.baseQty,
      allocatedShipping: allocated,
      landedCost: landed,
      landedUnitCost: landedUnit,
    };
  });

  const subtotal = computed.reduce((sum, c) => roundTo4(sum + c.extendedCost), 0);

  return { computed, subtotal };
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
