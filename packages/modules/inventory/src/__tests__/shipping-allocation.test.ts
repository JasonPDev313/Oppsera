import { describe, it, expect } from 'vitest';
import { allocateShipping, type AllocationLine } from '../services/shipping-allocation';

function makeLines(overrides: Partial<AllocationLine>[]): AllocationLine[] {
  return overrides.map((o, i) => ({
    id: o.id ?? `line-${i + 1}`,
    extendedCost: o.extendedCost ?? 100,
    baseQty: o.baseQty ?? 10,
    weight: o.weight ?? null,
  }));
}

function sumAllocations(result: Map<string, number>): number {
  return Math.round([...result.values()].reduce((a, b) => a + b, 0) * 10000) / 10000;
}

describe('allocateShipping', () => {
  // ── NONE method ─────────────────────────────────────
  it('returns zeros for method=none', () => {
    const lines = makeLines([{ extendedCost: 50 }, { extendedCost: 150 }]);
    const result = allocateShipping(lines, 20, 'none');
    expect(result.get('line-1')).toBe(0);
    expect(result.get('line-2')).toBe(0);
  });

  it('returns zeros when shippingCost=0', () => {
    const lines = makeLines([{ extendedCost: 50 }]);
    const result = allocateShipping(lines, 0, 'by_cost');
    expect(result.get('line-1')).toBe(0);
  });

  it('returns empty map for empty lines', () => {
    const result = allocateShipping([], 20, 'by_cost');
    expect(result.size).toBe(0);
  });

  // ── BY_COST method ──────────────────────────────────
  it('allocates by cost proportionally', () => {
    const lines = makeLines([
      { id: 'a', extendedCost: 100 },
      { id: 'b', extendedCost: 300 },
    ]);
    const result = allocateShipping(lines, 20, 'by_cost');
    expect(result.get('a')).toBe(5);
    expect(result.get('b')).toBe(15);
    expect(sumAllocations(result)).toBe(20);
  });

  it('allocates by cost — single line gets full amount', () => {
    const lines = makeLines([{ id: 'only', extendedCost: 50 }]);
    const result = allocateShipping(lines, 7.5, 'by_cost');
    expect(result.get('only')).toBe(7.5);
  });

  it('by_cost remainder goes to highest cost line', () => {
    // 3 lines with equal cost → can't divide 10 evenly into 3 at 4dp
    const lines = makeLines([
      { id: 'a', extendedCost: 100 },
      { id: 'b', extendedCost: 100 },
      { id: 'c', extendedCost: 100 },
    ]);
    const result = allocateShipping(lines, 10, 'by_cost');
    expect(sumAllocations(result)).toBe(10);
  });

  // ── BY_QTY method ───────────────────────────────────
  it('allocates by quantity proportionally', () => {
    const lines = makeLines([
      { id: 'a', baseQty: 10 },
      { id: 'b', baseQty: 30 },
    ]);
    const result = allocateShipping(lines, 8, 'by_qty');
    expect(result.get('a')).toBe(2);
    expect(result.get('b')).toBe(6);
    expect(sumAllocations(result)).toBe(8);
  });

  // ── BY_WEIGHT method ────────────────────────────────
  it('allocates by weight proportionally', () => {
    const lines = makeLines([
      { id: 'a', weight: 5 },
      { id: 'b', weight: 15 },
    ]);
    const result = allocateShipping(lines, 20, 'by_weight');
    expect(result.get('a')).toBe(5);
    expect(result.get('b')).toBe(15);
    expect(sumAllocations(result)).toBe(20);
  });

  it('by_weight falls back to by_qty when all weights are null', () => {
    const lines = makeLines([
      { id: 'a', weight: null, baseQty: 10 },
      { id: 'b', weight: null, baseQty: 30 },
    ]);
    const result = allocateShipping(lines, 8, 'by_weight');
    expect(result.get('a')).toBe(2);
    expect(result.get('b')).toBe(6);
  });

  it('by_weight falls back to by_qty when all weights are 0', () => {
    const lines = makeLines([
      { id: 'a', weight: 0, baseQty: 20 },
      { id: 'b', weight: 0, baseQty: 20 },
    ]);
    const result = allocateShipping(lines, 10, 'by_weight');
    expect(result.get('a')).toBe(5);
    expect(result.get('b')).toBe(5);
  });

  // ── Remainder distribution ──────────────────────────
  it('sum ALWAYS equals shippingCost (stress test: 7 lines, odd amount)', () => {
    const lines = makeLines([
      { id: 'a', extendedCost: 10 },
      { id: 'b', extendedCost: 20 },
      { id: 'c', extendedCost: 30 },
      { id: 'd', extendedCost: 40 },
      { id: 'e', extendedCost: 50 },
      { id: 'f', extendedCost: 60 },
      { id: 'g', extendedCost: 70 },
    ]);
    const result = allocateShipping(lines, 13.3333, 'by_cost');
    expect(sumAllocations(result)).toBe(13.3333);
  });

  it('handles very small shipping cost', () => {
    const lines = makeLines([
      { id: 'a', extendedCost: 100 },
      { id: 'b', extendedCost: 200 },
    ]);
    const result = allocateShipping(lines, 0.0001, 'by_cost');
    expect(sumAllocations(result)).toBe(0.0001);
  });

  // ── Edge: all zero basis ────────────────────────────
  it('equal-splits when all extendedCosts are zero (by_cost)', () => {
    const lines = makeLines([
      { id: 'a', extendedCost: 0 },
      { id: 'b', extendedCost: 0 },
    ]);
    const result = allocateShipping(lines, 10, 'by_cost');
    expect(sumAllocations(result)).toBe(10);
  });

  it('equal-splits when all baseQty are zero (by_qty)', () => {
    const lines = makeLines([
      { id: 'a', baseQty: 0 },
      { id: 'b', baseQty: 0 },
    ]);
    const result = allocateShipping(lines, 10, 'by_qty');
    expect(sumAllocations(result)).toBe(10);
  });
});
