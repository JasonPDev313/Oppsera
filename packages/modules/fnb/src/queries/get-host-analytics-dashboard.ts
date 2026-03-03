import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HostAnalyticsDashboardInput {
  tenantId: string;
  locationId: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  mealPeriod?: string;
}

export interface HourlyMetric {
  businessDate: string;
  hourSlot: number;
  mealPeriod: string | null;
  totalCovers: number;
  totalReservations: number;
  totalWalkIns: number;
  totalWaitlistAdds: number;
  avgWaitMinutes: number;
  avgTurnMinutes: number;
  tableUtilizationPct: number;
  noShowCount: number;
  revenueCents: number;
}

export interface WaitlistAccuracyMetric {
  businessDate: string;
  mealPeriod: string | null;
  totalEntries: number;
  entriesWithQuote: number;
  avgQuotedMinutes: number;
  avgActualMinutes: number;
  avgErrorMinutes: number;
  accuracyPct: number;
  underEstimates: number;
  overEstimates: number;
  exactOrClose: number;
}

export interface SeatingEfficiencyMetric {
  businessDate: string;
  mealPeriod: string | null;
  totalSeatings: number;
  avgSeatToFirstOrderMinutes: number;
  capacityUtilizationPct: number;
  avgPartyVsTableSizeRatio: number;
  tablesTurnedCount: number;
  avgTurnsPerTable: number;
  reservationFillPct: number;
  walkInPct: number;
}

export interface DashboardSummary {
  totalCovers: number;
  avgTurnMinutes: number;
  avgWaitMinutes: number;
  avgUtilizationPct: number;
  waitlistAccuracyPct: number;
  noShowRate: number;
}

export interface HostAnalyticsDashboard {
  hourly: HourlyMetric[];
  waitlistAccuracy: WaitlistAccuracyMetric[];
  seatingEfficiency: SeatingEfficiencyMetric[];
  summary: DashboardSummary;
}

/**
 * Read the pre-aggregated host analytics read models for a date range.
 *
 * Queries rm_fnb_host_hourly, rm_fnb_waitlist_accuracy, and
 * rm_fnb_seating_efficiency then computes cross-day summary aggregates.
 *
 * Optionally filters by mealPeriod for the waitlist and seating tables.
 */
export async function getHostAnalyticsDashboard(
  input: HostAnalyticsDashboardInput,
): Promise<HostAnalyticsDashboard> {
  const { tenantId, locationId, startDate, endDate, mealPeriod } = input;

  return withTenant(tenantId, async (tx) => {
    // ── Hourly metrics ─────────────────────────────────────────────────
    const hourlyRows = await tx.execute(sql`
      SELECT
        business_date::text,
        hour_slot,
        meal_period,
        total_covers,
        total_reservations,
        total_walk_ins,
        total_waitlist_adds,
        avg_wait_minutes,
        avg_turn_minutes,
        table_utilization_pct,
        no_show_count,
        revenue_cents
      FROM rm_fnb_host_hourly
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND business_date BETWEEN ${startDate}::date AND ${endDate}::date
      ORDER BY business_date ASC, hour_slot ASC
    `);
    const hourly: HourlyMetric[] = Array.from(
      hourlyRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      businessDate: String(r.business_date),
      hourSlot: Number(r.hour_slot),
      mealPeriod: r.meal_period != null ? String(r.meal_period) : null,
      totalCovers: Number(r.total_covers),
      totalReservations: Number(r.total_reservations),
      totalWalkIns: Number(r.total_walk_ins),
      totalWaitlistAdds: Number(r.total_waitlist_adds),
      avgWaitMinutes: Number(r.avg_wait_minutes),
      avgTurnMinutes: Number(r.avg_turn_minutes),
      tableUtilizationPct: Number(r.table_utilization_pct),
      noShowCount: Number(r.no_show_count),
      revenueCents: Number(r.revenue_cents),
    }));

    // ── Waitlist accuracy ──────────────────────────────────────────────
    const wlBaseQuery = sql`
      SELECT
        business_date::text,
        meal_period,
        total_entries,
        entries_with_quote,
        avg_quoted_minutes,
        avg_actual_minutes,
        avg_error_minutes,
        accuracy_pct,
        under_estimates,
        over_estimates,
        exact_or_close
      FROM rm_fnb_waitlist_accuracy
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND business_date BETWEEN ${startDate}::date AND ${endDate}::date
    `;

    const wlRows = await tx.execute(
      mealPeriod
        ? sql`${wlBaseQuery} AND meal_period = ${mealPeriod} ORDER BY business_date ASC`
        : sql`${wlBaseQuery} ORDER BY business_date ASC`,
    );
    const waitlistAccuracy: WaitlistAccuracyMetric[] = Array.from(
      wlRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      businessDate: String(r.business_date),
      mealPeriod: r.meal_period != null ? String(r.meal_period) : null,
      totalEntries: Number(r.total_entries),
      entriesWithQuote: Number(r.entries_with_quote),
      avgQuotedMinutes: Number(r.avg_quoted_minutes),
      avgActualMinutes: Number(r.avg_actual_minutes),
      avgErrorMinutes: Number(r.avg_error_minutes),
      accuracyPct: Number(r.accuracy_pct),
      underEstimates: Number(r.under_estimates),
      overEstimates: Number(r.over_estimates),
      exactOrClose: Number(r.exact_or_close),
    }));

    // ── Seating efficiency ─────────────────────────────────────────────
    const seBaseQuery = sql`
      SELECT
        business_date::text,
        meal_period,
        total_seatings,
        avg_seat_to_first_order_minutes,
        capacity_utilization_pct,
        avg_party_vs_table_size_ratio,
        tables_turned_count,
        avg_turns_per_table,
        reservation_fill_pct,
        walk_in_pct
      FROM rm_fnb_seating_efficiency
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND business_date BETWEEN ${startDate}::date AND ${endDate}::date
    `;

    const seRows = await tx.execute(
      mealPeriod
        ? sql`${seBaseQuery} AND meal_period = ${mealPeriod} ORDER BY business_date ASC`
        : sql`${seBaseQuery} ORDER BY business_date ASC`,
    );
    const seatingEfficiency: SeatingEfficiencyMetric[] = Array.from(
      seRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      businessDate: String(r.business_date),
      mealPeriod: r.meal_period != null ? String(r.meal_period) : null,
      totalSeatings: Number(r.total_seatings),
      avgSeatToFirstOrderMinutes: Number(r.avg_seat_to_first_order_minutes),
      capacityUtilizationPct: Number(r.capacity_utilization_pct),
      avgPartyVsTableSizeRatio: Number(r.avg_party_vs_table_size_ratio),
      tablesTurnedCount: Number(r.tables_turned_count),
      avgTurnsPerTable: Number(r.avg_turns_per_table),
      reservationFillPct: Number(r.reservation_fill_pct),
      walkInPct: Number(r.walk_in_pct),
    }));

    // ── Summary aggregates (computed from fetched data) ────────────────
    const totalCovers = hourly.reduce((s, h) => s + h.totalCovers, 0);
    const totalReservations = hourly.reduce((s, h) => s + h.totalReservations, 0);
    const totalNoShows = hourly.reduce((s, h) => s + h.noShowCount, 0);

    // Weighted averages — weight by cover/entry count to avoid equal-slot bias
    const avgTurnMinutes = computeWeightedAvg(
      hourly,
      (h) => h.avgTurnMinutes,
      (h) => h.totalCovers,
    );
    const avgWaitMinutes = computeWeightedAvg(
      hourly,
      (h) => h.avgWaitMinutes,
      (h) => h.totalWaitlistAdds,
    );
    const avgUtilizationPct = computeWeightedAvg(
      hourly,
      (h) => h.tableUtilizationPct,
      () => 1,
    );
    const waitlistAccuracyPct = computeWeightedAvg(
      waitlistAccuracy,
      (w) => w.accuracyPct,
      (w) => w.entriesWithQuote,
    );

    const noShowRate = totalReservations > 0
      ? Number(((totalNoShows / totalReservations) * 100).toFixed(2))
      : 0;

    const summary: DashboardSummary = {
      totalCovers,
      avgTurnMinutes: Number(avgTurnMinutes.toFixed(1)),
      avgWaitMinutes: Number(avgWaitMinutes.toFixed(1)),
      avgUtilizationPct: Number(avgUtilizationPct.toFixed(2)),
      waitlistAccuracyPct: Number(waitlistAccuracyPct.toFixed(2)),
      noShowRate,
    };

    return { hourly, waitlistAccuracy, seatingEfficiency, summary };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Exported for unit testing only */
export function computeWeightedAvg<T>(
  rows: T[],
  valueFn: (row: T) => number,
  weightFn: (row: T) => number,
): number {
  if (rows.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const row of rows) {
    const w = weightFn(row);
    weightedSum += valueFn(row) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
