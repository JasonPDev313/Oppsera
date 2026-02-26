import { describe, it, expect } from 'vitest';
import {
  evaluateConditions,
  applyAdjustment,
  computeDynamicRate,
} from '../helpers/pricing-engine';
import type { PricingContext, PricingRuleRow } from '../helpers/pricing-engine';

const baseContext: PricingContext = {
  occupancyPct: 75,
  dayOfWeek: 5, // Friday
  leadTimeDays: 14,
  businessDate: '2026-03-15',
  roomTypeId: 'rt-1',
};

describe('evaluateConditions', () => {
  it('returns true for empty conditions', () => {
    expect(evaluateConditions({}, baseContext)).toBe(true);
  });

  describe('occupancy thresholds', () => {
    it('passes when occupancy above threshold', () => {
      expect(evaluateConditions({ occupancyAbovePct: 50 }, baseContext)).toBe(true);
    });

    it('fails when occupancy below threshold', () => {
      expect(evaluateConditions({ occupancyAbovePct: 90 }, baseContext)).toBe(false);
    });

    it('passes when occupancy below ceiling', () => {
      expect(evaluateConditions({ occupancyBelowPct: 80 }, baseContext)).toBe(true);
    });

    it('fails when occupancy above ceiling', () => {
      expect(evaluateConditions({ occupancyBelowPct: 50 }, baseContext)).toBe(false);
    });

    it('passes range: above 50 and below 80', () => {
      expect(evaluateConditions({ occupancyAbovePct: 50, occupancyBelowPct: 80 }, baseContext)).toBe(true);
    });

    it('fails range: above 80 and below 90', () => {
      expect(evaluateConditions({ occupancyAbovePct: 80, occupancyBelowPct: 90 }, baseContext)).toBe(false);
    });
  });

  describe('day of week', () => {
    it('passes when day is in list', () => {
      expect(evaluateConditions({ daysOfWeek: [5, 6] }, baseContext)).toBe(true);
    });

    it('fails when day is not in list', () => {
      expect(evaluateConditions({ daysOfWeek: [0, 1, 2] }, baseContext)).toBe(false);
    });

    it('ignores empty daysOfWeek array', () => {
      expect(evaluateConditions({ daysOfWeek: [] }, baseContext)).toBe(true);
    });
  });

  describe('lead time', () => {
    it('passes when lead time >= min', () => {
      expect(evaluateConditions({ leadTimeDaysMin: 7 }, baseContext)).toBe(true);
    });

    it('fails when lead time < min', () => {
      expect(evaluateConditions({ leadTimeDaysMin: 30 }, baseContext)).toBe(false);
    });

    it('passes when lead time <= max', () => {
      expect(evaluateConditions({ leadTimeDaysMax: 21 }, baseContext)).toBe(true);
    });

    it('fails when lead time > max', () => {
      expect(evaluateConditions({ leadTimeDaysMax: 7 }, baseContext)).toBe(false);
    });
  });

  describe('date ranges', () => {
    it('passes when business date is in range', () => {
      expect(evaluateConditions({
        dateRanges: [{ startDate: '2026-03-01', endDate: '2026-03-31' }],
      }, baseContext)).toBe(true);
    });

    it('fails when business date is outside all ranges', () => {
      expect(evaluateConditions({
        dateRanges: [{ startDate: '2026-04-01', endDate: '2026-04-30' }],
      }, baseContext)).toBe(false);
    });

    it('passes when date is in any of multiple ranges', () => {
      expect(evaluateConditions({
        dateRanges: [
          { startDate: '2026-01-01', endDate: '2026-01-31' },
          { startDate: '2026-03-01', endDate: '2026-03-31' },
        ],
      }, baseContext)).toBe(true);
    });

    it('ignores empty dateRanges array', () => {
      expect(evaluateConditions({ dateRanges: [] }, baseContext)).toBe(true);
    });
  });

  describe('room type filter', () => {
    it('passes when room type is in list', () => {
      expect(evaluateConditions({ roomTypeIds: ['rt-1', 'rt-2'] }, baseContext)).toBe(true);
    });

    it('fails when room type is not in list', () => {
      expect(evaluateConditions({ roomTypeIds: ['rt-3'] }, baseContext)).toBe(false);
    });

    it('ignores empty roomTypeIds array', () => {
      expect(evaluateConditions({ roomTypeIds: [] }, baseContext)).toBe(true);
    });
  });

  describe('combined conditions', () => {
    it('all conditions must pass', () => {
      expect(evaluateConditions({
        occupancyAbovePct: 50,
        daysOfWeek: [5],
        leadTimeDaysMin: 7,
        roomTypeIds: ['rt-1'],
      }, baseContext)).toBe(true);
    });

    it('fails if any condition fails', () => {
      expect(evaluateConditions({
        occupancyAbovePct: 50,
        daysOfWeek: [0], // Friday is 5, not 0
        leadTimeDaysMin: 7,
      }, baseContext)).toBe(false);
    });
  });
});

describe('applyAdjustment', () => {
  it('percentage increase', () => {
    expect(applyAdjustment(10000, { type: 'percentage', amount: 10, direction: 'increase' })).toBe(11000);
  });

  it('percentage decrease', () => {
    expect(applyAdjustment(10000, { type: 'percentage', amount: 20, direction: 'decrease' })).toBe(8000);
  });

  it('fixed increase', () => {
    expect(applyAdjustment(10000, { type: 'fixed', amount: 500, direction: 'increase' })).toBe(10500);
  });

  it('fixed decrease', () => {
    expect(applyAdjustment(10000, { type: 'fixed', amount: 500, direction: 'decrease' })).toBe(9500);
  });

  it('rounds percentage adjustments', () => {
    expect(applyAdjustment(9999, { type: 'percentage', amount: 33, direction: 'increase' })).toBe(13299);
  });

  it('handles zero amount', () => {
    expect(applyAdjustment(10000, { type: 'percentage', amount: 0, direction: 'increase' })).toBe(10000);
  });
});

describe('computeDynamicRate', () => {
  const makeRule = (overrides: Partial<PricingRuleRow> = {}): PricingRuleRow => ({
    id: 'rule-1',
    name: 'Test Rule',
    ruleType: 'occupancy',
    priority: 10,
    conditionsJson: {},
    adjustmentsJson: { type: 'percentage', amount: 10, direction: 'increase' },
    floorCents: null,
    ceilingCents: null,
    ...overrides,
  });

  it('returns base rate when no rules', () => {
    const result = computeDynamicRate(15000, [], baseContext);
    expect(result.baseCents).toBe(15000);
    expect(result.adjustedCents).toBe(15000);
    expect(result.rulesApplied).toHaveLength(0);
  });

  it('applies matching rule', () => {
    const rules = [makeRule()];
    const result = computeDynamicRate(10000, rules, baseContext);
    expect(result.adjustedCents).toBe(11000);
    expect(result.rulesApplied).toHaveLength(1);
    expect(result.rulesApplied[0]!.ruleId).toBe('rule-1');
    expect(result.rulesApplied[0]!.adjustment).toBe(1000);
  });

  it('skips non-matching rules', () => {
    const rules = [makeRule({ conditionsJson: { occupancyAbovePct: 95 } })];
    const result = computeDynamicRate(10000, rules, baseContext);
    expect(result.adjustedCents).toBe(10000);
    expect(result.rulesApplied).toHaveLength(0);
  });

  it('applies rules in priority order (highest first)', () => {
    const rules = [
      makeRule({
        id: 'low-pri',
        name: 'Low Priority',
        priority: 5,
        adjustmentsJson: { type: 'fixed', amount: 500, direction: 'increase' },
      }),
      makeRule({
        id: 'high-pri',
        name: 'High Priority',
        priority: 20,
        adjustmentsJson: { type: 'percentage', amount: 10, direction: 'increase' },
      }),
    ];
    const result = computeDynamicRate(10000, rules, baseContext);
    // High priority first: 10000 * 1.1 = 11000
    // Low priority second: 11000 + 500 = 11500
    expect(result.adjustedCents).toBe(11500);
    expect(result.rulesApplied).toHaveLength(2);
    expect(result.rulesApplied[0]!.ruleId).toBe('high-pri');
    expect(result.rulesApplied[1]!.ruleId).toBe('low-pri');
  });

  it('respects floor', () => {
    const rules = [makeRule({
      adjustmentsJson: { type: 'percentage', amount: 50, direction: 'decrease' },
      floorCents: 8000,
    })];
    const result = computeDynamicRate(10000, rules, baseContext);
    // 10000 * 0.5 = 5000, but floor is 8000
    expect(result.adjustedCents).toBe(8000);
  });

  it('respects ceiling', () => {
    const rules = [makeRule({
      adjustmentsJson: { type: 'percentage', amount: 100, direction: 'increase' },
      ceilingCents: 15000,
    })];
    const result = computeDynamicRate(10000, rules, baseContext);
    // 10000 * 2 = 20000, but ceiling is 15000
    expect(result.adjustedCents).toBe(15000);
  });

  it('ensures non-negative result', () => {
    const rules = [makeRule({
      adjustmentsJson: { type: 'fixed', amount: 999999, direction: 'decrease' },
    })];
    const result = computeDynamicRate(10000, rules, baseContext);
    expect(result.adjustedCents).toBe(0);
  });

  it('tracks adjustment amount after clamping', () => {
    const rules = [makeRule({
      adjustmentsJson: { type: 'percentage', amount: 50, direction: 'decrease' },
      floorCents: 8000,
    })];
    const result = computeDynamicRate(10000, rules, baseContext);
    // Clamped from 5000 to 8000, adjustment = 8000 - 10000 = -2000
    expect(result.rulesApplied[0]!.adjustment).toBe(-2000);
  });

  it('chains multiple rules cumulatively', () => {
    const rules = [
      makeRule({
        id: 'r1', priority: 20,
        adjustmentsJson: { type: 'percentage', amount: 10, direction: 'increase' },
      }),
      makeRule({
        id: 'r2', priority: 10,
        adjustmentsJson: { type: 'percentage', amount: 10, direction: 'increase' },
      }),
    ];
    const result = computeDynamicRate(10000, rules, baseContext);
    // r1: 10000 * 1.1 = 11000
    // r2: 11000 * 1.1 = 12100
    expect(result.adjustedCents).toBe(12100);
  });
});
