import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GetTurnTimeAveragesInput {
  tenantId: string;
  locationId: string;
  /**
   * Restrict to a specific meal period (e.g. 'breakfast', 'lunch', 'dinner').
   * When omitted, all meal periods are included.
   */
  mealPeriod?: string;
  /**
   * Day-of-week filter: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
   * When omitted, all days are included.
   */
  dayOfWeek?: number;
  /**
   * Party-size bucket: 'small' (1-2), 'medium' (3-4), 'large' (5-6),
   * 'xlarge' (7+).  When omitted, all party sizes are included.
   */
  partySizeBucket?: 'small' | 'medium' | 'large' | 'xlarge';
  /**
   * How many calendar days to look back (default 28).
   * A larger window produces more stable estimates but may include outdated
   * data; a smaller window reflects recent operational changes.
   */
  days?: number;
}

export interface TurnTimeAverages {
  avgMinutes: number;
  p75Minutes: number;
  p90Minutes: number;
  sampleSize: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Returned when there is no historical data to aggregate. */
const EMPTY_DEFAULTS: TurnTimeAverages = {
  avgMinutes: 60,
  p75Minutes: 75,
  p90Minutes: 90,
  sampleSize: 0,
};

// ── Party-size bucket → SQL CASE expression ───────────────────────────────────

const PARTY_SIZE_CASE = sql`
  CASE
    WHEN party_size <= 2 THEN 'small'
    WHEN party_size <= 4 THEN 'medium'
    WHEN party_size <= 6 THEN 'large'
    ELSE 'xlarge'
  END
`;

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Aggregate turn-time statistics from `fnb_table_turn_log` for the given
 * tenant / location and optional dimension filters.
 *
 * Uses Postgres `PERCENTILE_CONT` for P75 / P90, which requires at least one
 * non-null row.  When the result set is empty we return safe defaults so callers
 * can always display a recommendation without null-guarding.
 *
 * Performance note: the query only touches rows where `turn_time_minutes IS NOT
 * NULL` (completed turns) and is bounded by the lookback window, so it remains
 * fast even on large log tables — see migration 0257 for the supporting index.
 */
export async function getTurnTimeAverages(
  input: GetTurnTimeAveragesInput,
): Promise<TurnTimeAverages> {
  const days = input.days ?? 28;

  return withTenant(input.tenantId, async (tx) => {
    // Build filter conditions dynamically.
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
      sql`turn_time_minutes IS NOT NULL`,
      sql`seated_at >= now() - (${days} || ' days')::interval`,
    ];

    if (input.mealPeriod) {
      conditions.push(sql`meal_period = ${input.mealPeriod}`);
    }

    if (input.dayOfWeek !== undefined) {
      // EXTRACT(DOW ...) returns 0 = Sunday … 6 = Saturday, matching JS.
      conditions.push(sql`EXTRACT(DOW FROM seated_at) = ${input.dayOfWeek}`);
    }

    if (input.partySizeBucket) {
      switch (input.partySizeBucket) {
        case 'small':
          conditions.push(sql`party_size <= 2`);
          break;
        case 'medium':
          conditions.push(sql`party_size BETWEEN 3 AND 4`);
          break;
        case 'large':
          conditions.push(sql`party_size BETWEEN 5 AND 6`);
          break;
        case 'xlarge':
          conditions.push(sql`party_size >= 7`);
          break;
      }
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        ROUND(AVG(turn_time_minutes))::int                                          AS avg_minutes,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY turn_time_minutes))::int AS p75_minutes,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY turn_time_minutes))::int AS p90_minutes,
        COUNT(*)::int                                                               AS sample_size
      FROM fnb_table_turn_log
      WHERE ${whereClause}
    `);

    const result = Array.from(rows as Iterable<Record<string, unknown>>)[0];

    // COUNT(*) will always return a row, but AVG / PERCENTILE_CONT return NULL
    // when the filtered set is empty.  Detect that and return safe defaults.
    if (!result || result.avg_minutes === null || result.avg_minutes === undefined) {
      return { ...EMPTY_DEFAULTS };
    }

    const sampleSize = Number(result.sample_size ?? 0);
    if (sampleSize === 0) {
      return { ...EMPTY_DEFAULTS };
    }

    return {
      avgMinutes: Number(result.avg_minutes),
      p75Minutes: Number(result.p75_minutes ?? result.avg_minutes),
      p90Minutes: Number(result.p90_minutes ?? result.avg_minutes),
      sampleSize,
    };
  });
}
