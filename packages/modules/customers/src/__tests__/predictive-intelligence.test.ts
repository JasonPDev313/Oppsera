/**
 * Session 4 — Predictive Intelligence: RFM + Metrics
 *
 * Tests for:
 * 1. RFM quintile bucketing and scoring
 * 2. RFM segment mapping
 * 3. Predictive metrics formulas (churn risk, CLV, spend velocity, next visit)
 * 4. Edge cases (0 orders, single customer, dormant, very new)
 */

import { describe, it, expect } from 'vitest';
import {
  getRfmSegment,
  getRfmSegmentLabel,
  SCORE_TYPES,
  RFM_SEGMENTS,
} from '@oppsera/shared';
import { assignQuintileScores, computeQuintiles } from '../services/rfm-scoring-engine';
import {
  computeChurnRisk,
  computePredictedClv,
  computeSpendVelocity,
  computeDaysUntilNextVisit,
  computeMetricsForCustomer,
} from '../services/predictive-metrics';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCustomerRaw(
  id: string,
  daysSinceLastVisit: number,
  orderCount: number,
  totalSpendCents: number,
) {
  return { id, daysSinceLastVisit, orderCount, totalSpendCents };
}

function makePredictiveData(overrides: Partial<Parameters<typeof computeMetricsForCustomer>[0]> = {}) {
  return {
    customerId: 'cust-1',
    totalVisits: 10,
    totalSpendCents: 50000, // $500
    avgSpendCents: 5000, // $50
    lastVisitAt: new Date('2026-02-20'),
    firstVisitAt: new Date('2025-06-01'),
    recentOrders3mo: 3,
    recentSpend3mo: 15000,
    recentOrders12mo: 10,
    recentSpend12mo: 50000,
    visitDates: [
      '2025-06-01', '2025-07-15', '2025-08-20', '2025-09-25',
      '2025-11-01', '2025-12-10', '2026-01-05', '2026-01-20',
      '2026-02-05', '2026-02-20',
    ],
    ...overrides,
  };
}

const NOW = new Date('2026-02-27');

// ═══════════════════════════════════════════════════════════════════════════
// 1. RFM Score Constants & Segment Mapping
// ═══════════════════════════════════════════════════════════════════════════

describe('Score type constants', () => {
  it('defines all 8 score types', () => {
    expect(Object.keys(SCORE_TYPES)).toHaveLength(8);
    expect(SCORE_TYPES.RFM).toBe('rfm');
    expect(SCORE_TYPES.CHURN_RISK).toBe('churn_risk');
    expect(SCORE_TYPES.PREDICTED_CLV).toBe('predicted_clv');
    expect(SCORE_TYPES.SPEND_VELOCITY).toBe('spend_velocity');
    expect(SCORE_TYPES.DAYS_UNTIL_PREDICTED_VISIT).toBe('days_until_predicted_visit');
  });
});

describe('RFM segment mapping', () => {
  it('maps 5-5-5 to champions', () => {
    expect(getRfmSegment(5, 5, 5)).toBe('champions');
  });

  it('maps 5-5-4 to champions', () => {
    expect(getRfmSegment(5, 5, 4)).toBe('champions');
  });

  it('maps 1-1-1 to lost', () => {
    expect(getRfmSegment(1, 1, 1)).toBe('lost');
  });

  it('maps 2-5-5 to at_risk', () => {
    expect(getRfmSegment(2, 5, 5)).toBe('at_risk');
  });

  it('maps 1-5-5 to cant_lose_them', () => {
    expect(getRfmSegment(1, 5, 5)).toBe('cant_lose_them');
  });

  it('falls back to composite range for unmapped tuples', () => {
    // 3-4-5 = composite 60, should fall into loyal_customers via composite range
    const segment = getRfmSegment(3, 4, 5);
    expect(segment).toBeDefined();
    expect(typeof segment).toBe('string');
  });

  it('provides human-readable labels', () => {
    expect(getRfmSegmentLabel('champions')).toBe('Champions');
    expect(getRfmSegmentLabel('lost')).toBe('Lost');
    expect(getRfmSegmentLabel('cant_lose_them')).toBe("Can't Lose Them");
  });

  it('defines 11 segments', () => {
    expect(RFM_SEGMENTS).toHaveLength(11);
  });

  it('all segment keys are unique', () => {
    const keys = RFM_SEGMENTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Quintile Bucketing
// ═══════════════════════════════════════════════════════════════════════════

describe('computeQuintiles', () => {
  it('assigns score 3 for a single customer', () => {
    const customers = [makeCustomerRaw('c1', 10, 5, 1000)];
    const result = computeQuintiles(customers, (m) => m.orderCount, false);
    expect(result.get('c1')).toBe(3);
  });

  it('returns empty map for empty input', () => {
    const result = computeQuintiles([], (m) => m.orderCount, false);
    expect(result.size).toBe(0);
  });

  it('assigns scores 1-5 for 5 customers (direct)', () => {
    const sorted = [
      makeCustomerRaw('c1', 0, 1, 100),
      makeCustomerRaw('c2', 0, 2, 200),
      makeCustomerRaw('c3', 0, 3, 300),
      makeCustomerRaw('c4', 0, 4, 400),
      makeCustomerRaw('c5', 0, 5, 500),
    ];
    const result = computeQuintiles(sorted, (m) => m.orderCount, false);
    expect(result.get('c1')).toBe(1);
    expect(result.get('c2')).toBe(2);
    expect(result.get('c3')).toBe(3);
    expect(result.get('c4')).toBe(4);
    expect(result.get('c5')).toBe(5);
  });

  it('inverts scores for recency (low days = high score)', () => {
    const sorted = [
      makeCustomerRaw('c1', 1, 0, 0),   // 1 day = recent → score 5
      makeCustomerRaw('c2', 10, 0, 0),
      makeCustomerRaw('c3', 30, 0, 0),
      makeCustomerRaw('c4', 60, 0, 0),
      makeCustomerRaw('c5', 180, 0, 0), // 180 days = stale → score 1
    ];
    const result = computeQuintiles(sorted, (m) => m.daysSinceLastVisit, true);
    expect(result.get('c1')).toBe(5); // most recent → highest score
    expect(result.get('c5')).toBe(1); // most stale → lowest score
  });

  it('distributes 10 customers into quintiles', () => {
    const sorted = Array.from({ length: 10 }, (_, i) =>
      makeCustomerRaw(`c${i}`, 0, i + 1, 0),
    );
    const result = computeQuintiles(sorted, (m) => m.orderCount, false);

    // With 10 customers, bucket size = 2
    expect(result.get('c0')).toBe(1);
    expect(result.get('c1')).toBe(1);
    expect(result.get('c2')).toBe(2);
    expect(result.get('c3')).toBe(2);
    expect(result.get('c4')).toBe(3);
    expect(result.get('c5')).toBe(3);
    expect(result.get('c6')).toBe(4);
    expect(result.get('c7')).toBe(4);
    expect(result.get('c8')).toBe(5);
    expect(result.get('c9')).toBe(5);
  });
});

describe('assignQuintileScores', () => {
  it('returns empty array for empty input', () => {
    expect(assignQuintileScores([])).toEqual([]);
  });

  it('scores a single customer with 3-3-3', () => {
    const metrics = [makeCustomerRaw('c1', 10, 5, 1000)];
    const results = assignQuintileScores(metrics);
    expect(results).toHaveLength(1);
    expect(results[0]!.recency).toBe(3);
    expect(results[0]!.frequency).toBe(3);
    expect(results[0]!.monetary).toBe(3);
    expect(results[0]!.composite).toBe(27); // 3*3*3
  });

  it('assigns highest recency to most recent customer', () => {
    const metrics = [
      makeCustomerRaw('recent', 1, 5, 5000),
      makeCustomerRaw('old1', 30, 5, 5000),
      makeCustomerRaw('old2', 60, 5, 5000),
      makeCustomerRaw('old3', 90, 5, 5000),
      makeCustomerRaw('oldest', 365, 5, 5000),
    ];
    const results = assignQuintileScores(metrics);
    const recentResult = results.find((r) => r.customerId === 'recent')!;
    const oldestResult = results.find((r) => r.customerId === 'oldest')!;
    expect(recentResult.recency).toBe(5);
    expect(oldestResult.recency).toBe(1);
  });

  it('assigns highest frequency to most frequent customer', () => {
    const metrics = [
      makeCustomerRaw('high', 10, 100, 5000),
      makeCustomerRaw('med1', 10, 50, 5000),
      makeCustomerRaw('med2', 10, 25, 5000),
      makeCustomerRaw('low1', 10, 10, 5000),
      makeCustomerRaw('low2', 10, 1, 5000),
    ];
    const results = assignQuintileScores(metrics);
    const highResult = results.find((r) => r.customerId === 'high')!;
    const low2Result = results.find((r) => r.customerId === 'low2')!;
    expect(highResult.frequency).toBe(5);
    expect(low2Result.frequency).toBe(1);
  });

  it('assigns highest monetary to biggest spender', () => {
    const metrics = [
      makeCustomerRaw('whale', 10, 5, 100000),
      makeCustomerRaw('big', 10, 5, 50000),
      makeCustomerRaw('mid', 10, 5, 25000),
      makeCustomerRaw('small', 10, 5, 5000),
      makeCustomerRaw('tiny', 10, 5, 500),
    ];
    const results = assignQuintileScores(metrics);
    const whaleResult = results.find((r) => r.customerId === 'whale')!;
    const tinyResult = results.find((r) => r.customerId === 'tiny')!;
    expect(whaleResult.monetary).toBe(5);
    expect(tinyResult.monetary).toBe(1);
  });

  it('composite score is R*F*M', () => {
    const metrics = [
      makeCustomerRaw('c1', 1, 100, 100000),
      makeCustomerRaw('c2', 30, 50, 50000),
      makeCustomerRaw('c3', 60, 25, 25000),
      makeCustomerRaw('c4', 90, 10, 5000),
      makeCustomerRaw('c5', 365, 1, 500),
    ];
    const results = assignQuintileScores(metrics);
    for (const r of results) {
      expect(r.composite).toBe(r.recency * r.frequency * r.monetary);
    }
  });

  it('maps each result to a valid segment', () => {
    const metrics = Array.from({ length: 20 }, (_, i) =>
      makeCustomerRaw(`c${i}`, i * 15, (i + 1) * 3, (i + 1) * 1000),
    );
    const results = assignQuintileScores(metrics);
    for (const r of results) {
      expect(r.segment).toBeDefined();
      expect(typeof r.segment).toBe('string');
    }
  });

  it('handles customers with 0 orders', () => {
    const metrics = [
      makeCustomerRaw('active', 5, 10, 5000),
      makeCustomerRaw('zero', 9999, 0, 0),
    ];
    const results = assignQuintileScores(metrics);
    const zeroResult = results.find((r) => r.customerId === 'zero')!;
    // Should have the lowest scores since sorted last for frequency and monetary
    expect(zeroResult.frequency).toBeLessThanOrEqual(3);
    expect(zeroResult.monetary).toBeLessThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Churn Risk Scoring
// ═══════════════════════════════════════════════════════════════════════════

describe('computeChurnRisk', () => {
  it('returns 0.5 for a customer with no visits', () => {
    const data = makePredictiveData({
      totalVisits: 0,
      lastVisitAt: null,
      firstVisitAt: null,
    });
    expect(computeChurnRisk(data, NOW)).toBe(0.5);
  });

  it('returns low risk for a frequent, recent customer', () => {
    const data = makePredictiveData({
      lastVisitAt: new Date('2026-02-25'), // 2 days ago
      totalVisits: 50,
      recentOrders3mo: 12,
      recentSpend3mo: 60000,
      recentOrders12mo: 40,
      recentSpend12mo: 200000,
    });
    const risk = computeChurnRisk(data, NOW);
    expect(risk).toBeLessThan(0.3);
  });

  it('returns high risk for a dormant customer', () => {
    const data = makePredictiveData({
      lastVisitAt: new Date('2025-06-01'), // ~9 months ago
      totalVisits: 10,
      firstVisitAt: new Date('2024-06-01'),
      recentOrders3mo: 0,
      recentSpend3mo: 0,
      recentOrders12mo: 2,
      recentSpend12mo: 10000,
      visitDates: ['2025-01-01', '2025-06-01'],
    });
    const risk = computeChurnRisk(data, NOW);
    expect(risk).toBeGreaterThan(0.6);
  });

  it('detects decelerating frequency as higher risk', () => {
    const accelerating = makePredictiveData({
      recentOrders3mo: 6,  // 2/month recent
      recentOrders12mo: 12, // 1/month overall
    });
    const decelerating = makePredictiveData({
      recentOrders3mo: 1,  // 0.33/month recent
      recentOrders12mo: 12, // 1/month overall
    });
    const riskAccel = computeChurnRisk(accelerating, NOW);
    const riskDecel = computeChurnRisk(decelerating, NOW);
    expect(riskDecel).toBeGreaterThan(riskAccel);
  });

  it('detects declining spend as higher risk', () => {
    const growing = makePredictiveData({
      recentSpend3mo: 30000,  // 10K/month recent
      recentSpend12mo: 60000, // 5K/month overall
    });
    const declining = makePredictiveData({
      recentSpend3mo: 3000,   // 1K/month recent
      recentSpend12mo: 60000, // 5K/month overall
    });
    const riskGrow = computeChurnRisk(growing, NOW);
    const riskDecline = computeChurnRisk(declining, NOW);
    expect(riskDecline).toBeGreaterThan(riskGrow);
  });

  it('returns score between 0 and 1', () => {
    const data = makePredictiveData();
    const risk = computeChurnRisk(data, NOW);
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(1);
  });

  it('rounds to 2 decimal places', () => {
    const data = makePredictiveData();
    const risk = computeChurnRisk(data, NOW);
    const decimalPlaces = (risk.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Predicted CLV
// ═══════════════════════════════════════════════════════════════════════════

describe('computePredictedClv', () => {
  it('returns 0 for customer with no visits', () => {
    const data = makePredictiveData({ totalVisits: 0, avgSpendCents: 0 });
    expect(computePredictedClv(data, NOW)).toBe(0);
  });

  it('includes historical spend in CLV', () => {
    const data = makePredictiveData({ totalSpendCents: 100000 }); // $1000 historical
    const clv = computePredictedClv(data, NOW);
    expect(clv).toBeGreaterThanOrEqual(1000); // At least historical value
  });

  it('accounts for future predicted orders', () => {
    const highFreq = makePredictiveData({
      recentOrders3mo: 12, // 4/month
      recentOrders12mo: 36, // 3/month
      avgSpendCents: 5000,
      totalSpendCents: 50000,
    });
    const lowFreq = makePredictiveData({
      recentOrders3mo: 1, // 0.33/month
      recentOrders12mo: 4, // 0.33/month
      avgSpendCents: 5000,
      totalSpendCents: 50000,
    });
    const clvHigh = computePredictedClv(highFreq, NOW);
    const clvLow = computePredictedClv(lowFreq, NOW);
    expect(clvHigh).toBeGreaterThan(clvLow);
  });

  it('uses exponential decay weighting toward recent trend', () => {
    // Customer whose recent 3-month rate differs from 12-month rate
    const data = makePredictiveData({
      recentOrders3mo: 9, // 3/month (recent acceleration)
      recentOrders12mo: 12, // 1/month (overall)
      avgSpendCents: 5000,
      totalSpendCents: 60000,
    });
    const clv = computePredictedClv(data, NOW);
    // With 70% weight on recent, predicted monthly = 0.7*3 + 0.3*1 = 2.4
    // Future = 50 * 2.4 * 12 = $1440, plus $600 historical = ~$2040
    expect(clv).toBeGreaterThan(1500);
  });

  it('returns non-negative values', () => {
    const data = makePredictiveData();
    const clv = computePredictedClv(data, NOW);
    expect(clv).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Spend Velocity
// ═══════════════════════════════════════════════════════════════════════════

describe('computeSpendVelocity', () => {
  it('returns 0 for customer with no spend at all', () => {
    const data = makePredictiveData({
      recentSpend3mo: 0,
      recentSpend12mo: 0,
    });
    expect(computeSpendVelocity(data)).toBe(0);
  });

  it('returns 1.0 for customer with recent spend but no baseline', () => {
    const data = makePredictiveData({
      recentSpend3mo: 5000,
      recentSpend12mo: 0,
    });
    expect(computeSpendVelocity(data)).toBe(1.0);
  });

  it('returns positive velocity for growing customer', () => {
    const data = makePredictiveData({
      recentSpend3mo: 30000, // $10K/month
      recentSpend12mo: 60000, // $5K/month
    });
    const velocity = computeSpendVelocity(data);
    expect(velocity).toBeGreaterThan(0);
  });

  it('returns negative velocity for declining customer', () => {
    const data = makePredictiveData({
      recentSpend3mo: 6000, // $2K/month
      recentSpend12mo: 60000, // $5K/month
    });
    const velocity = computeSpendVelocity(data);
    expect(velocity).toBeLessThan(0);
  });

  it('returns 0 for steady customer', () => {
    const data = makePredictiveData({
      recentSpend3mo: 15000, // $5K/month
      recentSpend12mo: 60000, // $5K/month
    });
    const velocity = computeSpendVelocity(data);
    expect(velocity).toBe(0);
  });

  it('calculates correct growth rate', () => {
    // 3mo: $10K/month, 12mo: $5K/month → velocity = (10-5)/5 = 1.0 = 100% growth
    const data = makePredictiveData({
      recentSpend3mo: 30000,
      recentSpend12mo: 60000,
    });
    expect(computeSpendVelocity(data)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Predicted Next Visit
// ═══════════════════════════════════════════════════════════════════════════

describe('computeDaysUntilNextVisit', () => {
  it('returns 30 for new customer (0 visits)', () => {
    const data = makePredictiveData({
      totalVisits: 0,
      lastVisitAt: null,
      firstVisitAt: null,
      visitDates: [],
    });
    expect(computeDaysUntilNextVisit(data, NOW)).toBe(30);
  });

  it('returns 14 for single-visit customer', () => {
    const data = makePredictiveData({
      totalVisits: 1,
      lastVisitAt: new Date('2026-02-20'),
      firstVisitAt: new Date('2026-02-20'),
      visitDates: ['2026-02-20'],
    });
    expect(computeDaysUntilNextVisit(data, NOW)).toBe(14);
  });

  it('returns 0 for overdue customer', () => {
    const data = makePredictiveData({
      totalVisits: 10,
      lastVisitAt: new Date('2025-12-01'), // ~3 months ago
      firstVisitAt: new Date('2025-01-01'),
      visitDates: [
        '2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01',
        '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01',
        '2025-09-01', '2025-12-01',
      ],
    });
    // Average interval is ~36 days, 88 days since last visit → overdue
    const days = computeDaysUntilNextVisit(data, NOW);
    expect(days).toBe(0);
  });

  it('predicts based on average inter-visit interval', () => {
    // Monthly visitor (every ~30 days), last visited 10 days ago
    const data = makePredictiveData({
      totalVisits: 6,
      lastVisitAt: new Date('2026-02-17'), // 10 days ago
      firstVisitAt: new Date('2025-09-17'),
      visitDates: [
        '2025-09-17', '2025-10-17', '2025-11-17',
        '2025-12-17', '2026-01-17', '2026-02-17',
      ],
    });
    const days = computeDaysUntilNextVisit(data, NOW);
    // Avg interval ~30 days, 10 days since last → ~20 days until next
    expect(days).toBeGreaterThanOrEqual(15);
    expect(days).toBeLessThanOrEqual(25);
  });

  it('never returns negative values', () => {
    const data = makePredictiveData({
      lastVisitAt: new Date('2024-01-01'), // way overdue
      visitDates: ['2024-01-01'],
    });
    const days = computeDaysUntilNextVisit(data, NOW);
    expect(days).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Combined Metrics
// ═══════════════════════════════════════════════════════════════════════════

describe('computeMetricsForCustomer', () => {
  it('returns all 4 metrics', () => {
    const data = makePredictiveData();
    const result = computeMetricsForCustomer(data, NOW);

    expect(result.customerId).toBe('cust-1');
    expect(typeof result.churnRisk).toBe('number');
    expect(typeof result.predictedClv).toBe('number');
    expect(typeof result.spendVelocity).toBe('number');
    expect(typeof result.daysUntilPredictedVisit).toBe('number');
  });

  it('handles dormant customer gracefully', () => {
    const data = makePredictiveData({
      totalVisits: 2,
      lastVisitAt: new Date('2025-01-01'),
      firstVisitAt: new Date('2024-06-01'),
      recentOrders3mo: 0,
      recentSpend3mo: 0,
      recentOrders12mo: 1,
      recentSpend12mo: 5000,
      visitDates: [],
    });
    const result = computeMetricsForCustomer(data, NOW);

    // Should not throw, and should indicate high churn
    expect(result.churnRisk).toBeGreaterThan(0.5);
    expect(result.daysUntilPredictedVisit).toBe(0); // Overdue
  });

  it('handles very new customer gracefully', () => {
    const data = makePredictiveData({
      totalVisits: 1,
      totalSpendCents: 5000,
      avgSpendCents: 5000,
      lastVisitAt: new Date('2026-02-26'),
      firstVisitAt: new Date('2026-02-26'),
      recentOrders3mo: 1,
      recentSpend3mo: 5000,
      recentOrders12mo: 1,
      recentSpend12mo: 5000,
      visitDates: ['2026-02-26'],
    });
    const result = computeMetricsForCustomer(data, NOW);

    expect(result.churnRisk).toBeGreaterThanOrEqual(0);
    expect(result.churnRisk).toBeLessThanOrEqual(1);
    expect(result.predictedClv).toBeGreaterThan(0);
    expect(result.daysUntilPredictedVisit).toBe(14); // Single visit default
  });

  it('all metrics are finite numbers', () => {
    const data = makePredictiveData();
    const result = computeMetricsForCustomer(data, NOW);

    expect(Number.isFinite(result.churnRisk)).toBe(true);
    expect(Number.isFinite(result.predictedClv)).toBe(true);
    expect(Number.isFinite(result.spendVelocity)).toBe(true);
    expect(Number.isFinite(result.daysUntilPredictedVisit)).toBe(true);
  });
});
