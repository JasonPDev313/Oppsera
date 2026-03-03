import { describe, it, expect } from 'vitest';
import {
  calculateRevPASH,
  generateYieldRecommendations,
} from '../services/revpash-calculator';
import type { DemandSlot } from '../services/revpash-calculator';
import { computeWeightedAvg } from '../queries/get-host-analytics-dashboard';

// ── calculateRevPASH ─────────────────────────────────────────────────

describe('calculateRevPASH', () => {
  it('calculates standard RevPASH: $5000 revenue / 50 seats / 4 hours = $25/seat-hour', () => {
    const result = calculateRevPASH(500_000, 50, 4);

    // 500000 / (50 * 4) = 500000 / 200 = 2500 cents = $25.00
    expect(result.revpashCents).toBe(2500);
    expect(result.revpashDollars).toBe('$25.00');
    expect(result.totalRevenueCents).toBe(500_000);
    expect(result.availableSeats).toBe(50);
    expect(result.hoursInPeriod).toBe(4);
  });

  it('returns $0.00 when totalRevenueCents is zero', () => {
    const result = calculateRevPASH(0, 50, 4);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
    expect(result.totalRevenueCents).toBe(0);
  });

  it('returns $0.00 when availableSeats is zero', () => {
    const result = calculateRevPASH(100_000, 0, 4);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
    expect(result.availableSeats).toBe(0);
    expect(result.hoursInPeriod).toBe(4);
  });

  it('returns $0.00 when hoursInPeriod is zero', () => {
    const result = calculateRevPASH(100_000, 50, 0);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
    expect(result.availableSeats).toBe(50);
    expect(result.hoursInPeriod).toBe(0);
  });

  it('returns $0.00 when availableSeats is negative', () => {
    const result = calculateRevPASH(100_000, -1, 4);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
  });

  it('returns $0.00 when hoursInPeriod is negative', () => {
    const result = calculateRevPASH(100_000, 50, -1);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
  });

  it('rounds fractional cents correctly', () => {
    // 1000 / (3 * 4) = 1000 / 12 = 83.333... → rounds to 83
    const result = calculateRevPASH(1000, 3, 4);
    expect(result.revpashCents).toBe(83);
    expect(result.revpashDollars).toBe('$0.83');
  });

  it('formats revpashDollars with two decimal places', () => {
    // 150 / (1 * 1) = 150 cents = $1.50
    const result = calculateRevPASH(150, 1, 1);
    expect(result.revpashDollars).toBe('$1.50');
  });

  it('handles single seat, single hour', () => {
    const result = calculateRevPASH(10_000, 1, 1);
    expect(result.revpashCents).toBe(10_000);
    expect(result.revpashDollars).toBe('$100.00');
  });

  it('preserves totalRevenueCents, availableSeats, hoursInPeriod in result', () => {
    const result = calculateRevPASH(200_000, 40, 5);
    expect(result.totalRevenueCents).toBe(200_000);
    expect(result.availableSeats).toBe(40);
    expect(result.hoursInPeriod).toBe(5);
  });
});

// ── generateYieldRecommendations ─────────────────────────────────────

const defaultSettings = { targetUtilization: 0.85, maxOverbookPercent: 10 };

const makePacing = (start: string, end: string, maxCovers: number) => ({
  intervalStartTime: start,
  intervalEndTime: end,
  maxCovers,
});

const makeDemand = (interval: string, booked: number, walkin: number): DemandSlot => ({
  interval,
  bookedCovers: booked,
  walkinCovers: walkin,
});

describe('generateYieldRecommendations', () => {
  it('returns "increase" when utilization is well below target (< 70% of target)', () => {
    // target = 85%, low threshold = 85% * 70% = 59.5%
    // utilization = 20/100 = 20% — well below threshold
    const pacing = [makePacing('11:00', '11:30', 100)];
    const demand = [makeDemand('11:00-11:30', 15, 5)];

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('increase');
    expect(result!.suggestedMaxCovers).toBeGreaterThan(result!.currentMaxCovers);
    expect(result!.interval).toBe('11:00-11:30');
    expect(result!.currentMaxCovers).toBe(100);
  });

  it('suggests +20% capacity on increase', () => {
    const pacing = [makePacing('12:00', '12:30', 50)];
    const demand = [makeDemand('12:00-12:30', 5, 5)]; // 10/50 = 20% utilization

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('increase');
    // 50 * 1.2 = 60, cap at 50 * 1.1 = 55
    expect(result!.suggestedMaxCovers).toBe(55);
  });

  it('caps increase suggestion at maxCovers * (1 + maxOverbookPercent/100)', () => {
    const pacing = [makePacing('11:00', '11:30', 100)];
    const demand = [makeDemand('11:00-11:30', 0, 0)]; // 0% utilization → increase

    const [result] = generateYieldRecommendations(pacing, demand, 45, { targetUtilization: 0.85, maxOverbookPercent: 5 });

    expect(result!.recommendation).toBe('increase');
    // 100 * 1.2 = 120, cap = 100 * 1.05 = 105
    expect(result!.suggestedMaxCovers).toBe(105);
  });

  it('returns "decrease" when utilization exceeds target * 1.1', () => {
    // target = 85%, high threshold = 85% * 110% = 93.5%
    // utilization = 100/100 = 100% — above threshold
    const pacing = [makePacing('18:00', '18:30', 100)];
    const demand = [makeDemand('18:00-18:30', 80, 20)]; // 100/100 = 100%

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('decrease');
    expect(result!.suggestedMaxCovers).toBeLessThan(result!.currentMaxCovers);
  });

  it('suggests -10% capacity on decrease', () => {
    const pacing = [makePacing('19:00', '19:30', 100)];
    const demand = [makeDemand('19:00-19:30', 95, 5)]; // 100/100 = 100%

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('decrease');
    // 100 * 0.9 = 90
    expect(result!.suggestedMaxCovers).toBe(90);
  });

  it('returns "hold" when utilization is within acceptable range', () => {
    // target = 85%, acceptable: 59.5%–93.5%
    // utilization = 80/100 = 80% — in range
    const pacing = [makePacing('13:00', '13:30', 100)];
    const demand = [makeDemand('13:00-13:30', 75, 5)]; // 80%

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('hold');
    expect(result!.suggestedMaxCovers).toBe(result!.currentMaxCovers);
  });

  it('handles exactly at target utilization as "hold"', () => {
    // 85/100 = 85% exactly = target → within range
    const pacing = [makePacing('14:00', '14:30', 100)];
    const demand = [makeDemand('14:00-14:30', 85, 0)];

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('hold');
  });

  it('handles missing demand slot (no covers = 0 utilization → increase)', () => {
    const pacing = [makePacing('10:00', '10:30', 80)];
    // No demand entry for this interval
    const demand: DemandSlot[] = [];

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('increase');
  });

  it('processes multiple intervals independently', () => {
    const pacing = [
      makePacing('11:00', '11:30', 100), // will be increase (0%)
      makePacing('12:00', '12:30', 100), // will be hold (82%)
      makePacing('13:00', '13:30', 100), // will be decrease (100%)
    ];
    const demand = [
      makeDemand('11:00-11:30', 0, 0),
      makeDemand('12:00-12:30', 80, 2),
      makeDemand('13:00-13:30', 95, 5),
    ];

    const results = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(results).toHaveLength(3);
    expect(results[0]!.recommendation).toBe('increase');
    expect(results[1]!.recommendation).toBe('hold');
    expect(results[2]!.recommendation).toBe('decrease');
  });

  it('returns empty array when no pacing rules', () => {
    const results = generateYieldRecommendations([], [], 45, defaultSettings);
    expect(results).toHaveLength(0);
  });

  it('includes reason string in each recommendation', () => {
    const pacing = [makePacing('11:00', '11:30', 100)];
    const demand = [makeDemand('11:00-11:30', 50, 0)];

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(typeof result!.reason).toBe('string');
    expect(result!.reason.length).toBeGreaterThan(0);
  });

  it('clamps decrease to minimum of 1 cover', () => {
    const pacing = [makePacing('18:00', '18:30', 2)];
    const demand = [makeDemand('18:00-18:30', 2, 0)]; // 100%

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('decrease');
    // 2 * 0.9 = 1.8 → floor to 1
    expect(result!.suggestedMaxCovers).toBeGreaterThanOrEqual(1);
  });

  it('handles zero maxCovers in pacing rule gracefully', () => {
    const pacing = [makePacing('15:00', '15:30', 0)];
    const demand = [makeDemand('15:00-15:30', 0, 0)];

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    // 0 utilization = increase
    expect(result!.recommendation).toBe('increase');
    expect(result!.currentMaxCovers).toBe(0);
  });
});

// ── Edge-case additions (hardening pass) ──────────────────────────────────────

describe('calculateRevPASH — edge cases', () => {
  it('returns $0.00 revpash on a $0 revenue day (0 cents)', () => {
    const result = calculateRevPASH(0, 80, 5);

    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
    expect(result.totalRevenueCents).toBe(0);
    expect(result.availableSeats).toBe(80);
    expect(result.hoursInPeriod).toBe(5);
  });

  it('formats very large revenue values correctly (no exponential notation)', () => {
    // $10,000 per seat-hour = 1,000,000 cents per seat-hour
    const result = calculateRevPASH(1_000_000 * 50 * 4, 50, 4);

    expect(result.revpashCents).toBe(1_000_000);
    expect(result.revpashDollars).toBe('$10000.00');
  });

  it('handles fractional result that rounds to exactly $0.01', () => {
    // 1 cent / 100 seats / 1 hour = 0.01 cents → rounds to 0
    const result = calculateRevPASH(1, 100, 1);
    // Math.round(1 / 100) = 0
    expect(result.revpashCents).toBe(0);
    expect(result.revpashDollars).toBe('$0.00');
  });
});

describe('generateYieldRecommendations — all slots at 100% utilization', () => {
  it('returns "decrease" for every slot when all are at 100% utilization', () => {
    const pacing = [
      makePacing('11:00', '11:30', 50),
      makePacing('12:00', '12:30', 60),
      makePacing('13:00', '13:30', 40),
    ];
    const demand = [
      makeDemand('11:00-11:30', 50, 0),
      makeDemand('12:00-12:30', 60, 0),
      makeDemand('13:00-13:30', 40, 0),
    ];

    const results = generateYieldRecommendations(pacing, demand, 60, defaultSettings);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.recommendation).toBe('decrease');
      expect(r.suggestedMaxCovers).toBeLessThan(r.currentMaxCovers);
    }
  });

  it('suggestedMaxCovers for decrease is always at least 1', () => {
    // Very small slots — ensure floor of 1 is respected
    const pacing = [makePacing('18:00', '18:30', 1)];
    const demand = [makeDemand('18:00-18:30', 1, 0)]; // 100%

    const [result] = generateYieldRecommendations(pacing, demand, 60, defaultSettings);

    expect(result!.recommendation).toBe('decrease');
    expect(result!.suggestedMaxCovers).toBe(1); // floor at 1
  });

  it('avg turn minutes annotation is absent in reason when recommendation is hold', () => {
    const pacing = [makePacing('12:00', '12:30', 100)];
    const demand = [makeDemand('12:00-12:30', 82, 0)]; // 82% — within 59.5-93.5% range

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('hold');
    expect(result!.reason).not.toContain('avg turn');
  });

  it('avg turn minutes annotation appears in reason for non-hold recommendations', () => {
    const pacing = [makePacing('11:00', '11:30', 100)];
    const demand = [makeDemand('11:00-11:30', 0, 0)]; // 0% → increase

    const [result] = generateYieldRecommendations(pacing, demand, 45, defaultSettings);

    expect(result!.recommendation).toBe('increase');
    expect(result!.reason).toContain('45min');
  });
});

describe('generateYieldRecommendations — date range 1-day boundary', () => {
  it('handles single pacing rule with no matching demand (returns increase)', () => {
    const pacing = [makePacing('09:00', '09:30', 30)];
    const demand: DemandSlot[] = []; // no data at all

    const [result] = generateYieldRecommendations(pacing, demand, 0, defaultSettings);

    // 0 utilization → increase
    expect(result!.recommendation).toBe('increase');
    // avg turn = 0 → no annotation added
    expect(result!.reason).not.toContain('avg turn');
  });
});

// ── S10 Analytics Dashboard — computeWeightedAvg (exported helper) ────────────

describe('computeWeightedAvg — host analytics summary helper', () => {
  it('returns 0 for an empty array', () => {
    const result = computeWeightedAvg([], (r: number) => r, (r: number) => r);
    expect(result).toBe(0);
  });

  it('returns the single value when there is one row', () => {
    const rows = [{ value: 60, weight: 10 }];
    const result = computeWeightedAvg(rows, (r) => r.value, (r) => r.weight);
    expect(result).toBe(60);
  });

  it('computes correct weighted average for two equal-weight rows', () => {
    // (50 * 10 + 70 * 10) / (10 + 10) = 1200/20 = 60
    const rows = [
      { value: 50, weight: 10 },
      { value: 70, weight: 10 },
    ];
    const result = computeWeightedAvg(rows, (r) => r.value, (r) => r.weight);
    expect(result).toBe(60);
  });

  it('computes correct weighted average when weights differ', () => {
    // (50 * 1 + 70 * 3) / (1 + 3) = (50 + 210) / 4 = 65
    const rows = [
      { value: 50, weight: 1 },
      { value: 70, weight: 3 },
    ];
    const result = computeWeightedAvg(rows, (r) => r.value, (r) => r.weight);
    expect(result).toBe(65);
  });

  it('returns 0 when all weights are 0 (avoids division by zero)', () => {
    // All weights zero → totalWeight = 0 → returns 0 (not NaN/Infinity)
    const rows = [
      { value: 50, weight: 0 },
      { value: 70, weight: 0 },
    ];
    const result = computeWeightedAvg(rows, (r) => r.value, (r) => r.weight);
    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('handles constant-weight-1 rows (unweighted average)', () => {
    // Unweighted case: every row has weight 1
    const rows = [30, 50, 70, 90];
    const result = computeWeightedAvg(rows, (r) => r, () => 1);
    // (30+50+70+90) / 4 = 60
    expect(result).toBe(60);
  });

  it('handles single-day date range correctly (1 hourly row)', () => {
    // Analytics: date range of exactly 1 day, 1 hour slot
    const rows = [{ avgTurnMinutes: 55, totalCovers: 40 }];
    const result = computeWeightedAvg(
      rows,
      (r) => r.avgTurnMinutes,
      (r) => r.totalCovers,
    );
    // Single row → weighted avg = 55 * 40 / 40 = 55
    expect(result).toBe(55);
  });

  it('returns 0 summary when no data exists (empty date range)', () => {
    // Analytics: no data for the date range — all arrays are empty
    const hourlyEmpty: Array<{ avgTurnMinutes: number; totalCovers: number }> = [];
    const avgTurn = computeWeightedAvg(hourlyEmpty, (h) => h.avgTurnMinutes, (h) => h.totalCovers);
    expect(avgTurn).toBe(0);
  });
});
