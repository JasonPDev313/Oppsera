/**
 * HOST V2 — Query: Get Turn-Time Prediction  (Session 7)
 *
 * Fetches table info, pre-computed aggregates, and host settings then
 * delegates to the pure `predictTurnTime()` function.
 *
 * DB access pattern:
 *  1. Read table type from fnb_tables
 *  2. Read all aggregate rows for this (tenant, location) — the predictor
 *     picks the best match itself
 *  3. Read host settings for the historicalWeight override (falls back to
 *     a sensible default when not configured)
 *
 * All three reads run in parallel to minimise latency.
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  predictTurnTime,
  type PredictionResult,
  type TurnTimeAggregate,
} from '../services/turn-time-predictor';
import { DEFAULT_TURN_TIMES } from '../services/wait-time-estimator';

// ── Input ────────────────────────────────────────────────────────────────────

export interface GetTurnTimePredictionInput {
  tenantId: string;
  locationId: string;
  tableId: string;
  partySize: number;
  /** Override the meal period; defaults to the current period if omitted */
  mealPeriod?: string;
  serverUserId?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Weight given to historical data when host settings don't specify one */
const DEFAULT_HISTORICAL_WEIGHT = 0.8;

/**
 * Simple meal-period heuristic based on the current hour (server time).
 * The host settings may carry proper period definitions; this is the fallback.
 */
function guessMealPeriod(hourOfDay: number): string {
  if (hourOfDay < 11) return 'breakfast';
  if (hourOfDay < 15) return 'lunch';
  if (hourOfDay < 17) return 'afternoon';
  return 'dinner';
}

// ── Query ────────────────────────────────────────────────────────────────────

export async function getTurnTimePrediction(
  input: GetTurnTimePredictionInput,
): Promise<PredictionResult> {
  const { tenantId, locationId, tableId, partySize, serverUserId } = input;
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday … 6 = Saturday
  const mealPeriod = input.mealPeriod ?? guessMealPeriod(now.getHours());

  return withTenant(tenantId, async (tx) => {
    // Run all three reads in parallel
    const [tableRows, aggRows, settingsRows] = await Promise.all([
      // 1. Table type
      tx.execute(sql`
        SELECT table_type
        FROM fnb_tables
        WHERE id = ${tableId}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `),

      // 2. Pre-computed aggregates for this location
      tx.execute(sql`
        SELECT
          table_type,
          meal_period,
          day_of_week,
          party_size_bucket,
          avg_minutes,
          p50_minutes,
          p75_minutes,
          p90_minutes,
          sample_count,
          server_avg_minutes
        FROM fnb_turn_time_aggregates
        WHERE tenant_id  = ${tenantId}
          AND location_id = ${locationId}
      `),

      // 3. Host settings — we only need the historicalWeight field if present
      tx.execute(sql`
        SELECT turn_time_historical_weight
        FROM fnb_host_settings
        WHERE tenant_id   = ${tenantId}
          AND location_id = ${locationId}
        LIMIT 1
      `),
    ]);

    // ── Coerce table type ────────────────────────────────────────────────────
    const tableRow = Array.from(tableRows as Iterable<Record<string, unknown>>)[0];
    const tableType = tableRow ? String(tableRow.table_type ?? 'standard') : 'standard';

    // ── Coerce aggregates ────────────────────────────────────────────────────
    const aggregates: TurnTimeAggregate[] = Array.from(
      aggRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      tableType: row.table_type !== null ? String(row.table_type) : null,
      mealPeriod: row.meal_period !== null ? String(row.meal_period) : null,
      dayOfWeek: row.day_of_week !== null ? Number(row.day_of_week) : null,
      partySizeBucket: row.party_size_bucket !== null ? String(row.party_size_bucket) : null,
      avgMinutes: Number(row.avg_minutes),
      p50Minutes: Number(row.p50_minutes),
      p75Minutes: Number(row.p75_minutes),
      p90Minutes: Number(row.p90_minutes),
      sampleCount: Number(row.sample_count),
      serverAvgMinutes: row.server_avg_minutes !== null ? Number(row.server_avg_minutes) : null,
    }));

    // ── Coerce settings ──────────────────────────────────────────────────────
    const settingsRow = Array.from(settingsRows as Iterable<Record<string, unknown>>)[0];
    const historicalWeight =
      settingsRow?.turn_time_historical_weight !== null &&
      settingsRow?.turn_time_historical_weight !== undefined
        ? Number(settingsRow.turn_time_historical_weight)
        : DEFAULT_HISTORICAL_WEIGHT;

    // ── Call pure predictor ──────────────────────────────────────────────────
    return predictTurnTime(
      aggregates,
      {
        tableType,
        mealPeriod,
        dayOfWeek,
        partySize,
        serverUserId,
      },
      {
        historicalWeight,
        defaultTurnMinutes: DEFAULT_TURN_TIMES,
      },
    );
  });
}
