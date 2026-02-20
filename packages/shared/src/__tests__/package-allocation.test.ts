import { describe, it, expect } from 'vitest';
import { computePackageAllocations } from '../utils/package-allocation';
import type { ComponentAllocationInput } from '../utils/package-allocation';

function makeComp(
  catalogItemId: string,
  qty: number,
  componentUnitPriceCents: number,
): ComponentAllocationInput {
  return {
    catalogItemId,
    itemName: catalogItemId,
    itemType: 'retail',
    qty,
    componentUnitPriceCents,
  };
}

describe('computePackageAllocations', () => {
  it('throws when components array is empty', () => {
    expect(() => computePackageAllocations(1000, [])).toThrow('components array must not be empty');
  });

  it('throws when packageSalePriceCents is negative', () => {
    expect(() => computePackageAllocations(-1, [makeComp('a', 1, 500)])).toThrow(
      'packageSalePriceCents must be >= 0',
    );
  });

  it('allocates 100% to a single component', () => {
    const [result] = computePackageAllocations(5000, [makeComp('a', 1, 5000)]);
    expect(result!.allocatedRevenueCents).toBe(5000);
    expect(result!.allocationWeight).toBe(1);
    expect(result!.componentExtendedCents).toBe(5000);
  });

  it('equal split — package price matches component sum exactly', () => {
    const results = computePackageAllocations(1000, [
      makeComp('a', 1, 500),
      makeComp('b', 1, 500),
    ]);
    expect(results[0]!.allocatedRevenueCents).toBe(500);
    expect(results[1]!.allocatedRevenueCents).toBe(500);
    expect(results[0]!.allocatedRevenueCents + results[1]!.allocatedRevenueCents).toBe(1000);
  });

  it('discount — package price < component sum (proportional)', () => {
    // Components: A=$6, B=$4, subtotal=$10. Package sells for $8 (20% discount)
    const results = computePackageAllocations(800, [
      makeComp('a', 1, 600),
      makeComp('b', 1, 400),
    ]);
    // A weight = 0.6 → 800 * 0.6 = 480, B weight = 0.4 → 800 * 0.4 = 320
    expect(results[0]!.allocatedRevenueCents).toBe(480);
    expect(results[1]!.allocatedRevenueCents).toBe(320);
    expect(results[0]!.allocatedRevenueCents + results[1]!.allocatedRevenueCents).toBe(800);
  });

  it('markup — package price > component sum (proportional)', () => {
    // Components: A=$3, B=$2, subtotal=$5. Package sells for $6 (markup)
    const results = computePackageAllocations(600, [
      makeComp('a', 1, 300),
      makeComp('b', 1, 200),
    ]);
    // A weight = 0.6 → 600 * 0.6 = 360, B weight = 0.4 → 600 * 0.4 = 240
    expect(results[0]!.allocatedRevenueCents).toBe(360);
    expect(results[1]!.allocatedRevenueCents).toBe(240);
    expect(results[0]!.allocatedRevenueCents + results[1]!.allocatedRevenueCents).toBe(600);
  });

  it('rounding — allocations sum exactly to packageSalePriceCents', () => {
    // Three components with unequal weights causing rounding issue: 1/3 each
    const results = computePackageAllocations(100, [
      makeComp('a', 1, 100),
      makeComp('b', 1, 100),
      makeComp('c', 1, 100),
    ]);
    const total = results.reduce((s, r) => s + r.allocatedRevenueCents, 0);
    expect(total).toBe(100);
  });

  it('rounding — three-component package with prime total', () => {
    // $0.97 split 3 ways: floor = 32, one gets 33 → [33, 32, 32]
    const results = computePackageAllocations(97, [
      makeComp('a', 1, 300),
      makeComp('b', 1, 200),
      makeComp('c', 1, 100),
    ]);
    const total = results.reduce((s, r) => s + r.allocatedRevenueCents, 0);
    expect(total).toBe(97);
  });

  it('qty multiplier — extended cost uses qty * unitPrice', () => {
    // A: qty=2 @ $5 = $10 extended. B: qty=1 @ $10 = $10 extended. Equal weights.
    const results = computePackageAllocations(2000, [
      makeComp('a', 2, 500),
      makeComp('b', 1, 1000),
    ]);
    expect(results[0]!.componentExtendedCents).toBe(1000);
    expect(results[1]!.componentExtendedCents).toBe(1000);
    expect(results[0]!.allocatedRevenueCents).toBe(1000);
    expect(results[1]!.allocatedRevenueCents).toBe(1000);
  });

  it('zero-price component gets 0 allocation when other components have price', () => {
    // A=$10, B=$0 — B should get 0 allocation
    const results = computePackageAllocations(800, [
      makeComp('a', 1, 1000),
      makeComp('b', 1, 0),
    ]);
    expect(results[0]!.allocatedRevenueCents).toBe(800);
    expect(results[1]!.allocatedRevenueCents).toBe(0);
    expect(results[0]!.allocatedRevenueCents + results[1]!.allocatedRevenueCents).toBe(800);
  });

  it('all-zero prices — distributes equally', () => {
    // All $0 → equal split of package price
    const results = computePackageAllocations(100, [
      makeComp('a', 1, 0),
      makeComp('b', 1, 0),
      makeComp('c', 1, 0),
      makeComp('d', 1, 0),
    ]);
    const total = results.reduce((s, r) => s + r.allocatedRevenueCents, 0);
    expect(total).toBe(100);
    // Each gets 25
    results.forEach((r) => expect(r.allocatedRevenueCents).toBe(25));
  });

  it('all-zero prices with indivisible remainder — distributes to first components', () => {
    // $10 split 3 ways: 3,3,3 + 1 remainder → [4, 3, 3]
    const results = computePackageAllocations(10, [
      makeComp('a', 1, 0),
      makeComp('b', 1, 0),
      makeComp('c', 1, 0),
    ]);
    const total = results.reduce((s, r) => s + r.allocatedRevenueCents, 0);
    expect(total).toBe(10);
    expect(results[0]!.allocatedRevenueCents).toBe(4);
    expect(results[1]!.allocatedRevenueCents).toBe(3);
    expect(results[2]!.allocatedRevenueCents).toBe(3);
  });

  it('package price of 0 — all allocations are 0', () => {
    const results = computePackageAllocations(0, [
      makeComp('a', 1, 500),
      makeComp('b', 1, 300),
    ]);
    results.forEach((r) => expect(r.allocatedRevenueCents).toBe(0));
  });

  it('allocationWeight sums to 1 when components have price', () => {
    const results = computePackageAllocations(1000, [
      makeComp('a', 1, 300),
      makeComp('b', 1, 700),
    ]);
    const weightSum = results.reduce((s, r) => s + r.allocationWeight, 0);
    expect(weightSum).toBeCloseTo(1, 10);
  });

  it('preserves input order', () => {
    const inputs = [makeComp('first', 1, 100), makeComp('second', 1, 200), makeComp('third', 1, 300)];
    const results = computePackageAllocations(600, inputs);
    expect(results[0]!.catalogItemId).toBe('first');
    expect(results[1]!.catalogItemId).toBe('second');
    expect(results[2]!.catalogItemId).toBe('third');
  });
});
