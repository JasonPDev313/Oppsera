/**
 * Tests for `predictTurnTime` — pure prediction algorithm (Session 7)
 *
 * All tests are deterministic; no DB access required.
 */

import { describe, it, expect } from 'vitest';
import {
  predictTurnTime,
  getPartySizeBucket,
  type TurnTimeAggregate,
  type PredictionInput,
  type PredictionSettings,
} from '../services/turn-time-predictor';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: PredictionSettings = {
  historicalWeight: 0.8,
  defaultTurnMinutes: {
    small: 45,
    medium: 60,
    large: 75,
    xlarge: 90,
  },
};

function makeAggregate(
  overrides: Partial<TurnTimeAggregate> = {},
): TurnTimeAggregate {
  return {
    tableType: null,
    mealPeriod: null,
    dayOfWeek: null,
    partySizeBucket: null,
    avgMinutes: 55,
    p50Minutes: 52,
    p75Minutes: 65,
    p90Minutes: 80,
    sampleCount: 60,
    serverAvgMinutes: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    tableType: 'standard',
    mealPeriod: 'dinner',
    dayOfWeek: 3, // Wednesday
    partySize: 2,
    ...overrides,
  };
}

// ── getPartySizeBucket ────────────────────────────────────────────────────────

describe('getPartySizeBucket', () => {
  it('maps 1 and 2 to small', () => {
    expect(getPartySizeBucket(1)).toBe('small');
    expect(getPartySizeBucket(2)).toBe('small');
  });

  it('maps 3 and 4 to medium', () => {
    expect(getPartySizeBucket(3)).toBe('medium');
    expect(getPartySizeBucket(4)).toBe('medium');
  });

  it('maps 5 and 6 to large', () => {
    expect(getPartySizeBucket(5)).toBe('large');
    expect(getPartySizeBucket(6)).toBe('large');
  });

  it('maps 7 and above to xlarge', () => {
    expect(getPartySizeBucket(7)).toBe('xlarge');
    expect(getPartySizeBucket(12)).toBe('xlarge');
  });
});

// ── predictTurnTime ───────────────────────────────────────────────────────────

describe('predictTurnTime', () => {
  // ── Test 1: Exact match → high confidence ──────────────────────────────────
  it('returns high confidence when exact match has ≥50 samples', () => {
    const agg = makeAggregate({
      tableType: 'standard',
      mealPeriod: 'dinner',
      dayOfWeek: 3,
      partySizeBucket: 'small',
      avgMinutes: 50,
      sampleCount: 80,
    });

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), DEFAULT_SETTINGS);

    expect(result.confidence).toBe('high');
    // predictedMinutes = 0.8*50 + 0.2*45 = 40+9 = 49 → rounded to 50, clamped to [15,180]
    expect(result.predictedMinutes).toBe(50);
    expect(result.factors.some((f) => f.includes('80 samples'))).toBe(true);
  });

  // ── Test 2: Medium confidence (20–49 samples) ─────────────────────────────
  it('returns medium confidence when aggregate has 20–49 samples', () => {
    const agg = makeAggregate({
      partySizeBucket: 'medium',
      avgMinutes: 60,
      sampleCount: 35,
    });

    const result = predictTurnTime(
      [agg],
      makeInput({ partySize: 4 }),
      DEFAULT_SETTINGS,
    );

    expect(result.confidence).toBe('medium');
  });

  // ── Test 3: Low confidence (10–19 samples) ────────────────────────────────
  it('returns low confidence when aggregate has 10–19 samples', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 50,
      sampleCount: 15,
    });

    const result = predictTurnTime([agg], makeInput({ partySize: 1 }), DEFAULT_SETTINGS);

    expect(result.confidence).toBe('low');
  });

  // ── Test 4: Partial match fallback ────────────────────────────────────────
  it('falls back to broader aggregate when no exact match exists', () => {
    // This aggregate has NO dayOfWeek set — it should be preferred when
    // the exact (with dayOfWeek=3) row is absent.
    const partialAgg = makeAggregate({
      tableType: 'standard',
      mealPeriod: 'dinner',
      dayOfWeek: null, // no day-of-week restriction
      partySizeBucket: 'small',
      avgMinutes: 52,
      sampleCount: 55,
    });

    const result = predictTurnTime(
      [partialAgg],
      makeInput({ partySize: 2, dayOfWeek: 5 }), // Friday
      DEFAULT_SETTINGS,
    );

    // Should still use partialAgg (best compatible match)
    expect(result.confidence).toBe('high');
    // predictedMinutes = 0.8*52 + 0.2*45 = 41.6+9 = 50.6 → 50
    expect(result.predictedMinutes).toBe(50);
  });

  // ── Test 5: No data → default confidence, uses default minutes ────────────
  it('uses default minutes and default confidence when no aggregates exist', () => {
    const result = predictTurnTime([], makeInput({ partySize: 2 }), DEFAULT_SETTINGS);

    expect(result.confidence).toBe('default');
    // small default = 45, round to nearest 5 → 45
    expect(result.predictedMinutes).toBe(45);
    expect(result.factors.some((f) => f.includes('No historical data'))).toBe(true);
  });

  // ── Test 6: Empty aggregates with medium party → uses medium default ───────
  it('uses medium default when partySize is 3-4 and no data', () => {
    const result = predictTurnTime([], makeInput({ partySize: 4 }), DEFAULT_SETTINGS);

    expect(result.confidence).toBe('default');
    // medium default = 60
    expect(result.predictedMinutes).toBe(60);
  });

  // ── Test 7: Server faster than location → prediction decreases ────────────
  it('reduces prediction when server is faster than location average', () => {
    const locationAvg = 60;
    const serverAvg = 50; // server finishes ~17% faster
    const agg = makeAggregate({
      partySizeBucket: 'medium',
      avgMinutes: locationAvg,
      sampleCount: 60,
      serverAvgMinutes: serverAvg,
    });

    const baseResult = predictTurnTime(
      [makeAggregate({ partySizeBucket: 'medium', avgMinutes: locationAvg, sampleCount: 60, serverAvgMinutes: null })],
      makeInput({ partySize: 3 }),
      DEFAULT_SETTINGS,
    );

    const serverResult = predictTurnTime(
      [agg],
      makeInput({ partySize: 3 }),
      DEFAULT_SETTINGS,
    );

    // Server result should be lower (faster server)
    expect(serverResult.predictedMinutes).toBeLessThan(baseResult.predictedMinutes);
    expect(serverResult.factors.some((f) => f.includes('faster'))).toBe(true);
  });

  // ── Test 8: Server slower than location → prediction increases ────────────
  it('increases prediction when server is slower than location average', () => {
    const locationAvg = 60;
    const serverAvg = 75; // server finishes ~25% slower (capped to +10%)
    const agg = makeAggregate({
      partySizeBucket: 'medium',
      avgMinutes: locationAvg,
      sampleCount: 60,
      serverAvgMinutes: serverAvg,
    });

    const baseResult = predictTurnTime(
      [makeAggregate({ partySizeBucket: 'medium', avgMinutes: locationAvg, sampleCount: 60, serverAvgMinutes: null })],
      makeInput({ partySize: 3 }),
      DEFAULT_SETTINGS,
    );

    const serverResult = predictTurnTime(
      [agg],
      makeInput({ partySize: 3 }),
      DEFAULT_SETTINGS,
    );

    expect(serverResult.predictedMinutes).toBeGreaterThan(baseResult.predictedMinutes);
    expect(serverResult.factors.some((f) => f.includes('slower'))).toBe(true);
  });

  // ── Test 9: Weekend multiplier applied correctly ──────────────────────────
  it('applies day-of-week multiplier correctly', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 50,
      sampleCount: 60,
    });

    const settingsWithMultiplier: PredictionSettings = {
      ...DEFAULT_SETTINGS,
      dayOfWeekMultiplier: {
        6: 1.2, // Saturday = 20% longer turns
      },
    };

    const weekdayResult = predictTurnTime(
      [agg],
      makeInput({ partySize: 2, dayOfWeek: 3 }),
      settingsWithMultiplier,
    );

    const saturdayResult = predictTurnTime(
      [agg],
      makeInput({ partySize: 2, dayOfWeek: 6 }),
      settingsWithMultiplier,
    );

    expect(saturdayResult.predictedMinutes).toBeGreaterThan(weekdayResult.predictedMinutes);
    expect(saturdayResult.factors.some((f) => f.includes('multiplier'))).toBe(true);
  });

  // ── Test 10: Large party uses xlarge bucket ───────────────────────────────
  it('uses xlarge bucket for partySize 7+', () => {
    const xlargeAgg = makeAggregate({
      partySizeBucket: 'xlarge',
      avgMinutes: 85,
      sampleCount: 50,
    });
    const mediumAgg = makeAggregate({
      partySizeBucket: 'medium',
      avgMinutes: 55,
      sampleCount: 50,
    });

    const result = predictTurnTime(
      [xlargeAgg, mediumAgg],
      makeInput({ partySize: 8 }),
      DEFAULT_SETTINGS,
    );

    // Should use xlargeAgg, not mediumAgg
    // predictedMinutes = 0.8*85 + 0.2*90 = 68+18 = 86 → 85
    expect(result.predictedMinutes).toBe(85);
    expect(result.factors.some((f) => f.includes('xlarge'))).toBe(true);
  });

  // ── Test 11: Clamping — too low → 15 min ─────────────────────────────────
  it('clamps predicted minutes to minimum of 15', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 5, // unrealistically low
      sampleCount: 60,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1.0,
      defaultTurnMinutes: { small: 5 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 1 }), settings);

    expect(result.predictedMinutes).toBeGreaterThanOrEqual(15);
  });

  // ── Test 12: Clamping — too high → 180 min ───────────────────────────────
  it('clamps predicted minutes to maximum of 180', () => {
    const agg = makeAggregate({
      partySizeBucket: 'xlarge',
      avgMinutes: 300, // unrealistically high
      sampleCount: 60,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1.0,
      defaultTurnMinutes: { xlarge: 300 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 10 }), settings);

    expect(result.predictedMinutes).toBeLessThanOrEqual(180);
  });

  // ── Test 13: Rounding to nearest 5 ───────────────────────────────────────
  it('rounds prediction to nearest 5 minutes', () => {
    // Design a case where raw result is 53
    // avgMinutes=53, hw=1.0 → raw=53 → rounded to 55
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 53,
      sampleCount: 60,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1.0,
      defaultTurnMinutes: { small: 53 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), settings);

    expect(result.predictedMinutes % 5).toBe(0);
  });

  // ── Test 14: Most-specific aggregate wins over broader one ────────────────
  it('prefers exact match over partial match', () => {
    const exactAgg = makeAggregate({
      tableType: 'standard',
      mealPeriod: 'dinner',
      dayOfWeek: 3,
      partySizeBucket: 'small',
      avgMinutes: 48,
      sampleCount: 55,
    });

    const broadAgg = makeAggregate({
      tableType: null,
      mealPeriod: null,
      dayOfWeek: null,
      partySizeBucket: 'small',
      avgMinutes: 70, // clearly different avg
      sampleCount: 200,
    });

    const result = predictTurnTime(
      [broadAgg, exactAgg],
      makeInput({ partySize: 2 }),
      DEFAULT_SETTINGS,
    );

    // Should use exactAgg (avg=48), not broadAgg (avg=70)
    // 0.8*48 + 0.2*45 = 38.4+9 = 47.4 → 45
    expect(result.predictedMinutes).toBeLessThan(60);
  });

  // ── Test 15: Incompatible aggregate (wrong bucket) is ignored ─────────────
  it('ignores aggregates for a different party size bucket', () => {
    const wrongBucketAgg = makeAggregate({
      partySizeBucket: 'xlarge',
      avgMinutes: 120,
      sampleCount: 100,
    });

    const result = predictTurnTime(
      [wrongBucketAgg],
      makeInput({ partySize: 2 }), // small bucket
      DEFAULT_SETTINGS,
    );

    // Should fall back to defaults since wrongBucketAgg is incompatible
    expect(result.confidence).toBe('default');
    expect(result.predictedMinutes).toBe(45); // small default
  });

  // ── Test 16: historicalWeight = 0 uses defaults entirely ─────────────────
  it('uses purely default minutes when historicalWeight is 0', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 99,
      sampleCount: 100,
    });

    const settings: PredictionSettings = {
      historicalWeight: 0,
      defaultTurnMinutes: { small: 45 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), settings);

    // 0*99 + 1*45 = 45
    expect(result.predictedMinutes).toBe(45);
  });

  // ── Test 17: historicalWeight = 1 uses historical entirely ───────────────
  it('uses purely historical minutes when historicalWeight is 1', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 55,
      sampleCount: 100,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1,
      defaultTurnMinutes: { small: 45 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), settings);

    // 1*55 + 0*45 = 55 → rounded to 55
    expect(result.predictedMinutes).toBe(55);
  });

  // ── Test 18: Server velocity cap at ±10% ─────────────────────────────────
  it('caps server velocity adjustment at 10%', () => {
    const locationAvg = 60;
    // Server is 50% slower — should be capped to +10%
    const serverAvg = 90;

    const agg = makeAggregate({
      partySizeBucket: 'medium',
      avgMinutes: locationAvg,
      sampleCount: 60,
      serverAvgMinutes: serverAvg,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1.0,
      defaultTurnMinutes: { medium: 60 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 3 }), settings);

    // raw = 1.0*60 = 60, then capped +10% = 66 → rounded to 65
    expect(result.predictedMinutes).toBe(65);
  });

  // ── Test 19: ALL aggregates incompatible (all return -1) → uses default ────
  it('uses default when every aggregate is incompatible (returns -1) with input', () => {
    // These aggregates each have a non-null dimension that contradicts the input.
    const aggregates = [
      makeAggregate({ partySizeBucket: 'large', avgMinutes: 90, sampleCount: 100 }),   // wrong bucket
      makeAggregate({ mealPeriod: 'lunch', avgMinutes: 50, sampleCount: 100 }),         // wrong meal period
      makeAggregate({ tableType: 'booth', avgMinutes: 70, sampleCount: 100 }),          // wrong table type
      makeAggregate({ dayOfWeek: 6, avgMinutes: 80, sampleCount: 100 }),                // wrong day
    ];

    const result = predictTurnTime(
      aggregates,
      makeInput({ partySize: 2, mealPeriod: 'dinner', tableType: 'standard', dayOfWeek: 3 }),
      DEFAULT_SETTINGS,
    );

    // No compatible aggregate → fallback to default
    expect(result.confidence).toBe('default');
    // small default = 45
    expect(result.predictedMinutes).toBe(45);
    expect(result.factors.some((f) => f.includes('No historical data'))).toBe(true);
  });

  // ── Test 20: All aggregates have sampleCount = 0 → treated as no data ──────
  it('falls back to default when best matching aggregate has sampleCount = 0', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 40,
      sampleCount: 0, // no samples
    });

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), DEFAULT_SETTINGS);

    expect(result.confidence).toBe('default');
    expect(result.predictedMinutes).toBe(45); // small default
  });

  // ── Test 21: historicalWeight clamped at edges (< 0 or > 1) ──────────────
  it('clamps historicalWeight below 0 to 0 (uses pure default)', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 90,
      sampleCount: 100,
    });

    const settings: PredictionSettings = {
      historicalWeight: -0.5, // invalid — should clamp to 0
      defaultTurnMinutes: { small: 45 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), settings);

    // historicalWeight clamped to 0 → 0*90 + 1*45 = 45
    expect(result.predictedMinutes).toBe(45);
  });

  it('clamps historicalWeight above 1 to 1 (uses pure historical)', () => {
    const agg = makeAggregate({
      partySizeBucket: 'small',
      avgMinutes: 55,
      sampleCount: 100,
    });

    const settings: PredictionSettings = {
      historicalWeight: 1.5, // invalid — should clamp to 1
      defaultTurnMinutes: { small: 45 },
    };

    const result = predictTurnTime([agg], makeInput({ partySize: 2 }), settings);

    // historicalWeight clamped to 1 → 1*55 + 0*45 = 55
    expect(result.predictedMinutes).toBe(55);
  });

  // ── Test 22: Prediction is always a multiple of 5 ────────────────────────
  it('always returns a prediction that is a multiple of 5', () => {
    // Test a range of raw values that would not be multiples of 5
    const rawMinutes = [47, 51, 58, 62, 73, 97, 112, 143, 167];
    for (const raw of rawMinutes) {
      const agg = makeAggregate({
        partySizeBucket: 'medium',
        avgMinutes: raw,
        sampleCount: 60,
      });
      const result = predictTurnTime([agg], makeInput({ partySize: 3 }), {
        historicalWeight: 1.0,
        defaultTurnMinutes: { medium: 60 },
      });
      expect(result.predictedMinutes % 5, `raw=${raw}`).toBe(0);
    }
  });
});
