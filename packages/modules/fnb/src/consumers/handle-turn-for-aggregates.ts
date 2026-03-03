/**
 * HOST V2 — Consumer: fnb.table.turn_completed.v1  (Session 7)
 *
 * When a table turn completes, this consumer refreshes the
 * `fnb_turn_time_aggregates` row for the (location, tableType, mealPeriod,
 * dayOfWeek, partySizeBucket) combination so the predictor always reads
 * fresh, pre-computed statistics.
 *
 * Implementation notes:
 * - Uses raw SQL via Drizzle's `tx.execute(sql`…`)` for the upsert so we
 *   can express ON CONFLICT on the natural-key columns without a named
 *   unique constraint.
 * - P50 / P75 / P90 are computed with `PERCENTILE_CONT` over the last 90
 *   days of completed turns that share the same dimension values.
 * - All DB operations are awaited — no fire-and-forget.
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { getPartySizeBucket } from '../services/turn-time-predictor';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TurnCompletedForAggregatesData {
  tenantId: string;
  locationId: string;
  tableId: string;
  partySize: number;
  turnTimeMinutes: number;
  mealPeriod: string;
  dayOfWeek: number;
}

// ── Consumer ─────────────────────────────────────────────────────────────────

export async function handleTurnCompletedForAggregates(
  data: TurnCompletedForAggregatesData,
): Promise<void> {
  // Consumers must never throw — errors are swallowed to protect business operations.
  try {
  const { tenantId, locationId, tableId, partySize, mealPeriod, dayOfWeek } = data;
  const partySizeBucket = getPartySizeBucket(partySize);

  await withTenant(tenantId, async (tx) => {
    // ── 1. Resolve table type from fnb_tables ─────────────────────────────
    const tableRows = await tx.execute(sql`
      SELECT table_type
      FROM fnb_tables
      WHERE id = ${tableId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const tableRow = Array.from(tableRows as Iterable<Record<string, unknown>>)[0];
    const tableType = tableRow ? String(tableRow.table_type ?? 'standard') : 'standard';

    // ── 2. Compute aggregate stats from turn log (last 90 days) ──────────
    const statsRows = await tx.execute(sql`
      SELECT
        ROUND(AVG(turn_time_minutes))::int                                          AS avg_minutes,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY turn_time_minutes))::int AS p50_minutes,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY turn_time_minutes))::int AS p75_minutes,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY turn_time_minutes))::int AS p90_minutes,
        COUNT(*)::int                                                               AS sample_count
      FROM fnb_table_turn_log ttl
      JOIN fnb_tables ft ON ft.id = ttl.table_id AND ft.tenant_id = ttl.tenant_id
      WHERE ttl.tenant_id      = ${tenantId}
        AND ttl.location_id    = ${locationId}
        AND ft.table_type      = ${tableType}
        AND ttl.meal_period    = ${mealPeriod}
        AND ttl.day_of_week    = ${dayOfWeek}
        AND ttl.turn_time_minutes IS NOT NULL
        AND ttl.seated_at >= now() - interval '90 days'
        AND (
          CASE
            WHEN ${partySize}::int <= 2 THEN ttl.party_size <= 2
            WHEN ${partySize}::int <= 4 THEN ttl.party_size BETWEEN 3 AND 4
            WHEN ${partySize}::int <= 6 THEN ttl.party_size BETWEEN 5 AND 6
            ELSE ttl.party_size >= 7
          END
        )
    `);

    const stats = Array.from(statsRows as Iterable<Record<string, unknown>>)[0];
    const sampleCount = Number(stats?.sample_count ?? 0);

    // Skip upsert when there are no completed turns to aggregate
    if (sampleCount === 0 || !stats || stats.avg_minutes === null) {
      return;
    }

    const avgMinutes = Number(stats.avg_minutes);
    const p50Minutes = Number(stats.p50_minutes ?? avgMinutes);
    const p75Minutes = Number(stats.p75_minutes ?? avgMinutes);
    const p90Minutes = Number(stats.p90_minutes ?? avgMinutes);

    const newId = generateUlid();

    // ── 3. Upsert into fnb_turn_time_aggregates ───────────────────────────
    //
    // ON CONFLICT on all 6 natural-key columns.  If a matching row already
    // exists (same location + tableType + mealPeriod + dayOfWeek +
    // partySizeBucket) it is refreshed in-place; otherwise a new row is
    // inserted.  We intentionally do not use a named unique constraint so
    // no extra DDL is required beyond the lookup index.
    await tx.execute(sql`
      INSERT INTO fnb_turn_time_aggregates (
        id,
        tenant_id,
        location_id,
        table_type,
        meal_period,
        day_of_week,
        party_size_bucket,
        avg_minutes,
        p50_minutes,
        p75_minutes,
        p90_minutes,
        sample_count,
        server_avg_minutes,
        last_computed_at,
        created_at,
        updated_at
      ) VALUES (
        ${newId},
        ${tenantId},
        ${locationId},
        ${tableType},
        ${mealPeriod},
        ${dayOfWeek},
        ${partySizeBucket},
        ${avgMinutes},
        ${p50Minutes},
        ${p75Minutes},
        ${p90Minutes},
        ${sampleCount},
        NULL,
        now(),
        now(),
        now()
      )
      ON CONFLICT (tenant_id, location_id, table_type, meal_period, day_of_week, party_size_bucket)
      DO UPDATE SET
        avg_minutes      = EXCLUDED.avg_minutes,
        p50_minutes      = EXCLUDED.p50_minutes,
        p75_minutes      = EXCLUDED.p75_minutes,
        p90_minutes      = EXCLUDED.p90_minutes,
        sample_count     = EXCLUDED.sample_count,
        last_computed_at = now(),
        updated_at       = now()
    `);
  });
  } catch (err) {
    // Intentionally swallowed — aggregate refresh failures must never surface
    // to callers or block the business operation that triggered this consumer.
    console.error('[handleTurnCompletedForAggregates] failed to refresh aggregate', err);
  }
}
