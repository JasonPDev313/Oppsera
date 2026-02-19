import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from './_shared';

export interface GetGolfUtilizationInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface GolfUtilizationRow {
  businessDate: string;
  slotsBooked: number;
  slotsAvailable: number;
  utilizationBps: number;
  cancellations: number;
  noShows: number;
}

/**
 * Daily utilization data from rm_golf_tee_time_demand.
 *
 * Multi-course: SUMs per date, recomputes utilizationBps from totals.
 */
export async function getGolfUtilization(input: GetGolfUtilizationInput): Promise<GolfUtilizationRow[]> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        business_date,
        SUM(slots_booked)::int     AS slots_booked,
        SUM(slots_available)::int  AS slots_available,
        SUM(cancellations)::int    AS cancellations,
        SUM(no_shows)::int         AS no_shows
      FROM rm_golf_tee_time_demand
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
      GROUP BY business_date
      ORDER BY business_date ASC
    `);
    const rows = Array.from(result as Iterable<{
      business_date: string;
      slots_booked: string;
      slots_available: string;
      cancellations: string;
      no_shows: string;
    }>);

    return rows.map((r) => {
      const booked = num(r.slots_booked);
      const available = num(r.slots_available);
      return {
        businessDate: r.business_date,
        slotsBooked: booked,
        slotsAvailable: available,
        utilizationBps: toBps(safeDivide(booked, available)),
        cancellations: num(r.cancellations),
        noShows: num(r.no_shows),
      };
    });
  });
}
