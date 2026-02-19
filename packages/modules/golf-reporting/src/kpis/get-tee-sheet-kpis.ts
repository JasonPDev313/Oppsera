import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from '../queries/_shared';

export interface GetTeeSheetKpisInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface TeeSheetKpis {
  slotsBooked: number;
  slotsAvailable: number;
  utilizationBps: number;
  cancellations: number;
  noShows: number;
  netPlayers: number;
  cancelRateBps: number;
  noShowRateBps: number;
}

/**
 * Aggregate tee sheet KPIs from rm_golf_tee_time_demand for a date range.
 *
 * All rates are computed from raw totals (not averaged per-day) to avoid
 * the "average of averages" problem (CLAUDE.md §81).
 */
export async function getTeeSheetKpis(input: GetTeeSheetKpisInput): Promise<TeeSheetKpis> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(slots_booked), 0)    AS slots_booked,
        COALESCE(SUM(slots_available), 0)  AS slots_available,
        COALESCE(SUM(cancellations), 0)    AS cancellations,
        COALESCE(SUM(no_shows), 0)         AS no_shows
      FROM rm_golf_tee_time_demand
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
    `);
    const rows = Array.from(result as Iterable<{
      slots_booked: string;
      slots_available: string;
      cancellations: string;
      no_shows: string;
    }>);
    const r = rows[0]!;

    const booked = num(r.slots_booked);
    const available = num(r.slots_available);
    const cancellations = num(r.cancellations);
    const noShows = num(r.no_shows);
    const netPlayers = booked - cancellations - noShows;

    return {
      slotsBooked: booked,
      slotsAvailable: available,
      utilizationBps: toBps(safeDivide(booked, available)),
      cancellations,
      noShows,
      netPlayers,
      cancelRateBps: toBps(safeDivide(cancellations, booked)),
      noShowRateBps: toBps(safeDivide(noShows, booked)),
    };
  });
}
