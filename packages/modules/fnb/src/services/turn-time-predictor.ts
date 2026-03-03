/**
 * HOST V2 — Predictive Turn Engine (Session 7)
 *
 * Pure prediction algorithm — NO DB access.
 * Accepts pre-fetched aggregate rows and returns a calibrated turn-time
 * estimate with a confidence band and an explanatory factors list.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TurnTimeAggregate {
  tableType: string | null;
  mealPeriod: string | null;
  dayOfWeek: number | null;
  partySizeBucket: string | null;
  avgMinutes: number;
  p50Minutes: number;
  p75Minutes: number;
  p90Minutes: number;
  sampleCount: number;
  serverAvgMinutes: number | null;
}

export interface PredictionInput {
  tableType: string;
  mealPeriod: string;
  dayOfWeek: number;
  partySize: number;
  serverUserId?: string;
}

export interface PredictionResult {
  predictedMinutes: number;
  confidence: 'high' | 'medium' | 'low' | 'default';
  factors: string[];
}

export interface PredictionSettings {
  /** 0–1: weight given to historical data vs. the static default.  e.g. 0.8 */
  historicalWeight: number;
  /** Fallback turn times by party-size bucket, in minutes */
  defaultTurnMinutes: Record<string, number>;
  /** Optional per-day-of-week multiplier, keyed by JS day number (0=Sun…6=Sat) */
  dayOfWeekMultiplier?: Record<number, number>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_PREDICTED_MINUTES = 15;
const MAX_PREDICTED_MINUTES = 180;
const ROUND_TO_MINUTES = 5;

/** Server velocity blend cap: ±10 % */
const SERVER_BLEND_MAX_DELTA = 0.10;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPartySizeBucket(partySize: number): string {
  if (partySize <= 2) return 'small';
  if (partySize <= 4) return 'medium';
  if (partySize <= 6) return 'large';
  return 'xlarge';
}

function confidenceFromSampleCount(
  sampleCount: number,
): PredictionResult['confidence'] {
  if (sampleCount >= 50) return 'high';
  if (sampleCount >= 20) return 'medium';
  if (sampleCount >= 10) return 'low';
  return 'default';
}

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Score an aggregate by how specifically it matches the input.
 * Higher score = better match.  Returns -1 when the aggregate is
 * incompatible with the input (i.e. it belongs to a different bucket or
 * meal period and therefore should never be used as a fallback for this
 * request).
 */
function matchScore(agg: TurnTimeAggregate, bucket: string, input: PredictionInput): number {
  // Hard constraints: if the aggregate has a non-null dimension that
  // contradicts the input, it cannot be used.
  if (agg.partySizeBucket !== null && agg.partySizeBucket !== bucket) return -1;
  if (agg.mealPeriod !== null && agg.mealPeriod !== input.mealPeriod) return -1;
  if (agg.tableType !== null && agg.tableType !== input.tableType) return -1;
  if (agg.dayOfWeek !== null && agg.dayOfWeek !== input.dayOfWeek) return -1;

  // Soft scoring: 1 point per matching non-null dimension
  let score = 0;
  if (agg.partySizeBucket !== null) score += 8; // most discriminating
  if (agg.tableType !== null) score += 4;
  if (agg.mealPeriod !== null) score += 2;
  if (agg.dayOfWeek !== null) score += 1;
  return score;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Predict table turn time using pre-computed aggregate rows.
 *
 * Matching strategy (most specific → least specific):
 *   a. tableType + mealPeriod + dayOfWeek + partySizeBucket  (score 15)
 *   b. tableType + mealPeriod + partySizeBucket              (score 14)
 *   c. mealPeriod + partySizeBucket                          (score 10)
 *   d. partySizeBucket only                                  (score  8)
 *   e. no match → 'default' confidence, use static defaults
 */
export function predictTurnTime(
  aggregates: TurnTimeAggregate[],
  input: PredictionInput,
  settings: PredictionSettings,
): PredictionResult {
  const bucket = getPartySizeBucket(input.partySize);
  const defaultMinutes =
    settings.defaultTurnMinutes[bucket] ??
    settings.defaultTurnMinutes['medium'] ??
    60;

  const factors: string[] = [];

  // ── Step 1: Find best-matching aggregate ─────────────────────────────────

  let bestAgg: TurnTimeAggregate | null = null;
  let bestScore = -1;

  for (const agg of aggregates) {
    const score = matchScore(agg, bucket, input);
    if (score > bestScore) {
      bestScore = score;
      bestAgg = agg;
    }
  }

  // ── Step 2: Compute raw prediction ───────────────────────────────────────

  let predictedMinutes: number;
  let confidence: PredictionResult['confidence'];

  if (bestAgg === null || bestAgg.sampleCount === 0) {
    // No usable historical data
    predictedMinutes = defaultMinutes;
    confidence = 'default';
    factors.push(`No historical data — using default turn time for ${bucket} parties (${defaultMinutes} min)`);
  } else {
    confidence = confidenceFromSampleCount(bestAgg.sampleCount);

    // Blend historical average with static default
    const hw = clamp(settings.historicalWeight, 0, 1);
    predictedMinutes =
      hw * bestAgg.avgMinutes + (1 - hw) * defaultMinutes;

    factors.push(
      `Historical avg ${bestAgg.avgMinutes} min (${bestAgg.sampleCount} samples, ${confidence} confidence)`,
    );

    if (hw < 1) {
      factors.push(
        `Blended with default ${defaultMinutes} min at weight ${(1 - hw).toFixed(2)}`,
      );
    }

    // Describe which dimensions the aggregate matched on
    const matchedDims: string[] = [];
    if (bestAgg.partySizeBucket !== null) matchedDims.push(`bucket=${bestAgg.partySizeBucket}`);
    if (bestAgg.tableType !== null) matchedDims.push(`tableType=${bestAgg.tableType}`);
    if (bestAgg.mealPeriod !== null) matchedDims.push(`period=${bestAgg.mealPeriod}`);
    if (bestAgg.dayOfWeek !== null) matchedDims.push(`dow=${bestAgg.dayOfWeek}`);
    if (matchedDims.length > 0) {
      factors.push(`Matched on: ${matchedDims.join(', ')}`);
    }
  }

  // ── Step 3: Day-of-week multiplier ───────────────────────────────────────

  if (settings.dayOfWeekMultiplier) {
    const multiplier = settings.dayOfWeekMultiplier[input.dayOfWeek];
    if (multiplier !== undefined && multiplier !== 1) {
      predictedMinutes *= multiplier;
      const pct = ((multiplier - 1) * 100).toFixed(0);
      const direction = multiplier > 1 ? '+' : '';
      factors.push(`Day-of-week multiplier ${multiplier.toFixed(2)} (${direction}${pct}% for dow=${input.dayOfWeek})`);
    }
  }

  // ── Step 4: Server velocity adjustment ───────────────────────────────────

  if (bestAgg !== null && bestAgg.serverAvgMinutes !== null) {
    const serverAvg = bestAgg.serverAvgMinutes;
    const locationAvg = bestAgg.avgMinutes;

    if (locationAvg > 0) {
      // Compute raw delta ratio
      const rawDelta = (serverAvg - locationAvg) / locationAvg;
      // Cap adjustment to ±10 %
      const cappedDelta = clamp(rawDelta, -SERVER_BLEND_MAX_DELTA, SERVER_BLEND_MAX_DELTA);

      if (Math.abs(cappedDelta) > 0.001) {
        predictedMinutes *= 1 + cappedDelta;
        const adjPct = (cappedDelta * 100).toFixed(1);
        const direction = cappedDelta > 0 ? 'slower' : 'faster';
        factors.push(
          `Server velocity ${direction} than location avg (${adjPct}% adjustment, server avg ${serverAvg} min)`,
        );
      }
    }
  }

  // ── Step 5: Round and clamp ──────────────────────────────────────────────

  predictedMinutes = roundToNearest(predictedMinutes, ROUND_TO_MINUTES);
  predictedMinutes = clamp(predictedMinutes, MIN_PREDICTED_MINUTES, MAX_PREDICTED_MINUTES);

  return { predictedMinutes, confidence, factors };
}
