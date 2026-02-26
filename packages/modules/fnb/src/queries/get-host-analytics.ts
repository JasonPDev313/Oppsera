import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HostAnalyticsInput {
  tenantId: string;
  locationId: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  mealPeriod?: string;
}

export interface HostAnalyticsResult {
  coversSummary: { actual: number; expected: number };
  waitTimeSummary: { avgQuotedMinutes: number; avgActualMinutes: number; accuracyPercent: number };
  turnTimeSummary: { totalTurns: number; avgMinutes: number; previousPeriodAvg: number };
  noShowSummary: { count: number; totalReservations: number; ratePercent: number };
  waitlistSummary: { totalAdded: number; totalSeated: number; conversionPercent: number };
  coversByHour: Array<{ hour: number; reservationCovers: number; walkInCovers: number }>;
  waitTimeScatter: Array<{ quotedMinutes: number; actualMinutes: number; partySize: number }>;
  turnTimeDistribution: Array<{ bucketLabel: string; count: number }>;
  noShowTrend: Array<{ date: string; count: number; movingAvg7d: number }>;
  peakHeatmap: Array<{ dayOfWeek: number; hour: number; covers: number }>;
}

/**
 * Aggregate all host analytics in a single call for the analytics dashboard.
 * Runs multiple queries in parallel inside a single withTenant call.
 */
export async function getHostAnalytics(
  input: HostAnalyticsInput,
): Promise<HostAnalyticsResult> {
  const { tenantId, locationId, startDate, endDate, mealPeriod } = input;

  // Compute previous period for comparison (same length preceding the range)
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - dayCount + 1);
  const prevStartStr = prevStart.toISOString().slice(0, 10);
  const prevEndStr = prevEnd.toISOString().slice(0, 10);

  const mealFilter = mealPeriod
    ? sql` AND meal_period = ${mealPeriod}`
    : sql``;

  return withTenant(tenantId, async (tx) => {
    const [
      coversRows,
      waitTimeRows,
      turnTimeRows,
      prevTurnRows,
      noShowRows,
      waitlistRows,
      coversByHourRows,
      waitScatterRows,
      turnDistRows,
      noShowTrendRows,
      peakHeatmapRows,
    ] = await Promise.all([
      // 1. Covers summary
      tx.execute(sql`
        SELECT
          COALESCE(SUM(party_size) FILTER (WHERE status IN ('seated', 'completed')), 0)::int AS actual,
          COALESCE(SUM(party_size) FILTER (WHERE status NOT IN ('canceled')), 0)::int AS expected
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date >= ${startDate}
          AND reservation_date <= ${endDate}
          ${mealFilter}
      `),

      // 2. Wait time accuracy
      tx.execute(sql`
        SELECT
          COALESCE(AVG(quoted_wait_minutes) FILTER (WHERE quoted_wait_minutes IS NOT NULL), 0)::numeric(10,1) AS avg_quoted,
          COALESCE(AVG(actual_wait_minutes) FILTER (WHERE actual_wait_minutes IS NOT NULL), 0)::numeric(10,1) AS avg_actual
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND added_at >= ${startDate}::date
          AND added_at < (${endDate}::date + 1)
      `),

      // 3. Turn time summary (current period)
      tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_turns,
          COALESCE(ROUND(AVG(turn_time_minutes)), 0)::int AS avg_minutes
        FROM fnb_table_turn_log
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= ${startDate}::date
          AND created_at < (${endDate}::date + 1)
          ${mealFilter}
      `),

      // 4. Turn time summary (previous period for comparison)
      tx.execute(sql`
        SELECT
          COALESCE(ROUND(AVG(turn_time_minutes)), 0)::int AS prev_avg
        FROM fnb_table_turn_log
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= ${prevStartStr}::date
          AND created_at < (${prevEndStr}::date + 1)
          ${mealFilter}
      `),

      // 5. No-show summary
      tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show_count,
          COUNT(*)::int AS total_reservations
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date >= ${startDate}
          AND reservation_date <= ${endDate}
          ${mealFilter}
      `),

      // 6. Waitlist summary
      tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_added,
          COUNT(*) FILTER (WHERE status = 'seated')::int AS total_seated
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND added_at >= ${startDate}::date
          AND added_at < (${endDate}::date + 1)
      `),

      // 7. Covers by hour (stacked: reservations vs walk-ins)
      tx.execute(sql`
        SELECT
          EXTRACT(HOUR FROM reservation_time::time)::int AS hour,
          COALESCE(SUM(party_size) FILTER (WHERE source != 'walk_in'), 0)::int AS reservation_covers,
          COALESCE(SUM(party_size) FILTER (WHERE source = 'walk_in'), 0)::int AS walk_in_covers
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date >= ${startDate}
          AND reservation_date <= ${endDate}
          AND status NOT IN ('canceled')
          ${mealFilter}
        GROUP BY EXTRACT(HOUR FROM reservation_time::time)
        ORDER BY hour
      `),

      // 8. Wait time scatter (quoted vs actual)
      tx.execute(sql`
        SELECT
          quoted_wait_minutes::int AS quoted_minutes,
          actual_wait_minutes::int AS actual_minutes,
          party_size
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND quoted_wait_minutes IS NOT NULL
          AND actual_wait_minutes IS NOT NULL
          AND added_at >= ${startDate}::date
          AND added_at < (${endDate}::date + 1)
        LIMIT 500
      `),

      // 9. Turn time distribution buckets
      tx.execute(sql`
        SELECT
          CASE
            WHEN turn_time_minutes < 30 THEN '0-30m'
            WHEN turn_time_minutes < 45 THEN '30-45m'
            WHEN turn_time_minutes < 60 THEN '45-60m'
            WHEN turn_time_minutes < 75 THEN '60-75m'
            WHEN turn_time_minutes < 90 THEN '75-90m'
            ELSE '90m+'
          END AS bucket_label,
          COUNT(*)::int AS count
        FROM fnb_table_turn_log
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= ${startDate}::date
          AND created_at < (${endDate}::date + 1)
          ${mealFilter}
        GROUP BY bucket_label
        ORDER BY MIN(turn_time_minutes)
      `),

      // 10. No-show trend by date
      tx.execute(sql`
        SELECT
          reservation_date AS date,
          COUNT(*) FILTER (WHERE status = 'no_show')::int AS count
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date >= ${startDate}
          AND reservation_date <= ${endDate}
          ${mealFilter}
        GROUP BY reservation_date
        ORDER BY reservation_date
      `),

      // 11. Peak heatmap (day of week × hour)
      tx.execute(sql`
        SELECT
          EXTRACT(DOW FROM reservation_date::date)::int AS day_of_week,
          EXTRACT(HOUR FROM reservation_time::time)::int AS hour,
          COALESCE(SUM(party_size), 0)::int AS covers
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date >= ${startDate}
          AND reservation_date <= ${endDate}
          AND status NOT IN ('canceled')
          ${mealFilter}
        GROUP BY
          EXTRACT(DOW FROM reservation_date::date),
          EXTRACT(HOUR FROM reservation_time::time)
        ORDER BY day_of_week, hour
      `),
    ]);

    // Map results
    const covers = Array.from(coversRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const waitTime = Array.from(waitTimeRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const turnTime = Array.from(turnTimeRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const prevTurn = Array.from(prevTurnRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const noShow = Array.from(noShowRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const waitlist = Array.from(waitlistRows as Iterable<Record<string, unknown>>)[0] ?? {};

    const avgQuoted = Number(waitTime.avg_quoted ?? 0);
    const avgActual = Number(waitTime.avg_actual ?? 0);
    const accuracyPercent = avgQuoted > 0
      ? Math.round((1 - Math.abs(avgActual - avgQuoted) / avgQuoted) * 100)
      : 100;

    const noShowCount = Number(noShow.no_show_count ?? 0);
    const totalRes = Number(noShow.total_reservations ?? 0);
    const totalAdded = Number(waitlist.total_added ?? 0);
    const totalSeated = Number(waitlist.total_seated ?? 0);

    // Build no-show trend with 7-day moving average
    const noShowDays = Array.from(noShowTrendRows as Iterable<Record<string, unknown>>).map(
      (row) => ({ date: String(row.date), count: Number(row.count ?? 0) }),
    );
    const noShowTrend = noShowDays.map((day, i) => {
      const windowStart = Math.max(0, i - 6);
      const window = noShowDays.slice(windowStart, i + 1);
      const movingAvg7d = window.length > 0
        ? Math.round((window.reduce((s, d) => s + d.count, 0) / window.length) * 10) / 10
        : 0;
      return { ...day, movingAvg7d };
    });

    return {
      coversSummary: {
        actual: Number(covers.actual ?? 0),
        expected: Number(covers.expected ?? 0),
      },
      waitTimeSummary: {
        avgQuotedMinutes: Math.round(avgQuoted),
        avgActualMinutes: Math.round(avgActual),
        accuracyPercent: Math.max(0, Math.min(100, accuracyPercent)),
      },
      turnTimeSummary: {
        totalTurns: Number(turnTime.total_turns ?? 0),
        avgMinutes: Number(turnTime.avg_minutes ?? 0),
        previousPeriodAvg: Number(prevTurn.prev_avg ?? 0),
      },
      noShowSummary: {
        count: noShowCount,
        totalReservations: totalRes,
        ratePercent: totalRes > 0 ? Math.round((noShowCount / totalRes) * 100) : 0,
      },
      waitlistSummary: {
        totalAdded,
        totalSeated,
        conversionPercent: totalAdded > 0 ? Math.round((totalSeated / totalAdded) * 100) : 0,
      },
      coversByHour: Array.from(coversByHourRows as Iterable<Record<string, unknown>>).map(
        (row) => ({
          hour: Number(row.hour ?? 0),
          reservationCovers: Number(row.reservation_covers ?? 0),
          walkInCovers: Number(row.walk_in_covers ?? 0),
        }),
      ),
      waitTimeScatter: Array.from(waitScatterRows as Iterable<Record<string, unknown>>).map(
        (row) => ({
          quotedMinutes: Number(row.quoted_minutes ?? 0),
          actualMinutes: Number(row.actual_minutes ?? 0),
          partySize: Number(row.party_size ?? 0),
        }),
      ),
      turnTimeDistribution: Array.from(turnDistRows as Iterable<Record<string, unknown>>).map(
        (row) => ({
          bucketLabel: String(row.bucket_label),
          count: Number(row.count ?? 0),
        }),
      ),
      noShowTrend,
      peakHeatmap: Array.from(peakHeatmapRows as Iterable<Record<string, unknown>>).map(
        (row) => ({
          dayOfWeek: Number(row.day_of_week ?? 0),
          hour: Number(row.hour ?? 0),
          covers: Number(row.covers ?? 0),
        }),
      ),
    };
  });
}
