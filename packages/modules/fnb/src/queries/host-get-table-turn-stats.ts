import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostGetTableTurnStatsInput } from '../validation-host';

export interface TurnTimeBucket {
  mealPeriod: string;
  partySizeBucket: string;
  avgTurnTimeMinutes: number;
  dataPointCount: number;
}

export interface HostTableTurnStats {
  buckets: TurnTimeBucket[];
  overallAvgMinutes: number;
  totalDataPoints: number;
}

/**
 * Average turn time grouped by meal period and party size bucket
 * for the last N days (default 28). Uses fnb_table_turn_log where
 * turn_time_minutes IS NOT NULL (completed turns only).
 *
 * Party size buckets:
 *   1-2 = 'small', 3-4 = 'medium', 5-6 = 'large', 7+ = 'xlarge'
 */
export async function hostGetTableTurnStats(
  input: HostGetTableTurnStatsInput,
): Promise<HostTableTurnStats> {
  const days = input.days ?? 28;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffIso = cutoffDate.toISOString();

  return withTenant(input.tenantId, async (tx) => {
    const [bucketRows, overallRows] = await Promise.all([
      // Grouped buckets
      tx.execute(sql`
        SELECT
          meal_period,
          CASE
            WHEN party_size <= 2 THEN 'small'
            WHEN party_size <= 4 THEN 'medium'
            WHEN party_size <= 6 THEN 'large'
            ELSE 'xlarge'
          END AS party_size_bucket,
          ROUND(AVG(turn_time_minutes))::int AS avg_turn_time_minutes,
          COUNT(*)::int AS data_point_count
        FROM fnb_table_turn_log
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= ${cutoffIso}
        GROUP BY meal_period,
          CASE
            WHEN party_size <= 2 THEN 'small'
            WHEN party_size <= 4 THEN 'medium'
            WHEN party_size <= 6 THEN 'large'
            ELSE 'xlarge'
          END
        ORDER BY meal_period ASC, party_size_bucket ASC
      `),

      // Overall aggregates
      tx.execute(sql`
        SELECT
          COALESCE(ROUND(AVG(turn_time_minutes)), 0)::int AS overall_avg_minutes,
          COUNT(*)::int AS total_data_points
        FROM fnb_table_turn_log
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= ${cutoffIso}
      `),
    ]);

    const buckets = Array.from(bucketRows as Iterable<Record<string, unknown>>).map(
      (row): TurnTimeBucket => ({
        mealPeriod: String(row.meal_period),
        partySizeBucket: String(row.party_size_bucket),
        avgTurnTimeMinutes: Number(row.avg_turn_time_minutes ?? 0),
        dataPointCount: Number(row.data_point_count ?? 0),
      }),
    );

    const overall = Array.from(overallRows as Iterable<Record<string, unknown>>)[0] ?? {};

    return {
      buckets,
      overallAvgMinutes: Number(overall.overall_avg_minutes ?? 0),
      totalDataPoints: Number(overall.total_data_points ?? 0),
    };
  });
}
