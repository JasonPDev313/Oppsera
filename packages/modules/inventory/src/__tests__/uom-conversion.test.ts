import { describe, it, expect } from 'vitest';
import { toBaseQty, landedUnitCost } from '../services/uom-conversion';

describe('toBaseQty', () => {
  it('returns same quantity when factor is 1 (base UOM)', () => {
    expect(toBaseQty(10, 1)).toBe(10);
  });

  it('converts pack to base units', () => {
    // 2 cases × 24 each = 48
    expect(toBaseQty(2, 24)).toBe(48);
  });

  it('handles fractional quantities', () => {
    // 1.5 cases × 12 = 18
    expect(toBaseQty(1.5, 12)).toBe(18);
  });

  it('handles fractional conversion factors', () => {
    // 10 lbs × 0.4536 (kg conversion) = 4.536
    expect(toBaseQty(10, 0.4536)).toBe(4.536);
  });

  it('rounds to 4 decimal places', () => {
    // 1/3 × 1 = 0.3333... → 0.3333
    expect(toBaseQty(1 / 3, 1)).toBe(0.3333);
  });
});

describe('landedUnitCost', () => {
  it('divides landed cost by base qty', () => {
    expect(landedUnitCost(48, 24)).toBe(2);
  });

  it('returns 0 when baseQty is 0', () => {
    expect(landedUnitCost(100, 0)).toBe(0);
  });

  it('handles fractional results', () => {
    // 100 / 3 = 33.3333...
    expect(landedUnitCost(100, 3)).toBe(33.3333);
  });
});
