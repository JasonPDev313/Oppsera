import { describe, it, expect } from 'vitest';
import {
  weightedAvgCost,
  lastCost,
  reverseWeightedAvgCost,
  costPreview,
} from '../services/costing';

describe('weightedAvgCost', () => {
  it('returns incoming cost when currentOnHand is 0', () => {
    expect(weightedAvgCost(0, 0, 10, 5)).toBe(5);
  });

  it('returns incoming cost when currentOnHand is negative', () => {
    expect(weightedAvgCost(-5, 3, 10, 5)).toBe(5);
  });

  it('returns currentCost when incomingQty is 0', () => {
    expect(weightedAvgCost(10, 5, 0, 99)).toBe(5);
  });

  it('computes weighted average correctly', () => {
    // 10 units @ $5 + 10 units @ $10 = 20 units @ $7.50
    expect(weightedAvgCost(10, 5, 10, 10)).toBe(7.5);
  });

  it('computes weighted average with uneven quantities', () => {
    // 20 units @ $3 + 5 units @ $8 = 25 units → (60+40)/25 = 4
    expect(weightedAvgCost(20, 3, 5, 8)).toBe(4);
  });

  it('rounds to 4 decimal places', () => {
    // 3 units @ $1 + 7 units @ $2 = 10 units → 17/10 = 1.7
    expect(weightedAvgCost(3, 1, 7, 2)).toBe(1.7);
  });
});

describe('lastCost', () => {
  it('returns the incoming cost', () => {
    expect(lastCost(12.3456)).toBe(12.3456);
  });

  it('returns 0 for zero cost', () => {
    expect(lastCost(0)).toBe(0);
  });
});

describe('reverseWeightedAvgCost', () => {
  it('reverses a weighted average receive', () => {
    // Before void: 20 units @ $7.50 (total $150)
    // Reversing: 10 units @ $10 (total $100)
    // After: 10 units → ($150 - $100) / 10 = $5
    expect(reverseWeightedAvgCost(20, 7.5, 10, 10)).toBe(5);
  });

  it('returns currentCost when afterQty would be zero', () => {
    expect(reverseWeightedAvgCost(10, 5, 10, 5)).toBe(5);
  });

  it('returns currentCost when afterQty would be negative', () => {
    expect(reverseWeightedAvgCost(5, 10, 10, 10)).toBe(10);
  });
});

describe('costPreview', () => {
  it('previews weighted_avg with margin', () => {
    const result = costPreview(10, 5, 20, 10, 10, 'weighted_avg');
    expect(result.newCost).toBe(7.5);
    expect(result.newOnHand).toBe(20);
    // margin = (20 - 7.5) / 20 * 100 = 62.5
    expect(result.marginPct).toBe(62.5);
  });

  it('previews standard cost (unchanged on receive)', () => {
    const result = costPreview(10, 5, 20, 10, 10, 'standard');
    expect(result.newCost).toBe(5);
    expect(result.newOnHand).toBe(20);
  });

  it('previews fifo (uses last cost)', () => {
    const result = costPreview(10, 5, null, 10, 8, 'fifo');
    expect(result.newCost).toBe(8);
    expect(result.newOnHand).toBe(20);
    expect(result.marginPct).toBeNull();
  });

  it('returns null margin when retailPrice is null', () => {
    const result = costPreview(10, 5, null, 5, 6, 'weighted_avg');
    expect(result.marginPct).toBeNull();
  });

  it('returns null margin when retailPrice is 0', () => {
    const result = costPreview(10, 5, 0, 5, 6, 'weighted_avg');
    expect(result.marginPct).toBeNull();
  });
});
