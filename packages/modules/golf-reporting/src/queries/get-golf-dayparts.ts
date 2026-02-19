import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from './_shared';

export interface GetGolfDaypartsInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface GolfDaypartRow {
  daypart: string;
  label: string;
  hourStart: number;
  hourEnd: number;
  slotsBooked: number;
  pctOfTotalBps: number;
}

interface DaypartDef {
  daypart: string;
  label: string;
  hourStart: number;
  hourEnd: number;
}

const DEFAULT_DAYPARTS: DaypartDef[] = [
  { daypart: 'early', label: 'Early (6-9)', hourStart: 6, hourEnd: 9 },
  { daypart: 'morning', label: 'Morning (9-12)', hourStart: 9, hourEnd: 12 },
  { daypart: 'afternoon', label: 'Afternoon (12-15)', hourStart: 12, hourEnd: 15 },
  { daypart: 'twilight', label: 'Twilight (15-18)', hourStart: 15, hourEnd: 18 },
  { daypart: 'evening', label: 'Evening (18+)', hourStart: 18, hourEnd: 24 },
];

/**
 * Daypart analysis from rm_golf_hourly_distribution.
 *
 * Queries hourly slot counts, then buckets them into daypart ranges in JS.
 * Each daypart's pctOfTotalBps is relative to the grand total across all dayparts.
 */
export async function getGolfDayparts(input: GetGolfDaypartsInput): Promise<GolfDaypartRow[]> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        hour_of_day,
        SUM(slots_booked)::int AS slots_booked
      FROM rm_golf_hourly_distribution
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
      GROUP BY hour_of_day
      ORDER BY hour_of_day ASC
    `);
    const hourRows = Array.from(result as Iterable<{
      hour_of_day: number;
      slots_booked: string;
    }>);

    // Build a map: hour → total slots
    const hourMap = new Map<number, number>();
    for (const r of hourRows) {
      hourMap.set(Number(r.hour_of_day), num(r.slots_booked));
    }

    // Bucket hours into dayparts
    const daypartRows: GolfDaypartRow[] = DEFAULT_DAYPARTS.map((dp) => {
      let slots = 0;
      for (let h = dp.hourStart; h < dp.hourEnd; h++) {
        slots += hourMap.get(h) ?? 0;
      }
      return {
        daypart: dp.daypart,
        label: dp.label,
        hourStart: dp.hourStart,
        hourEnd: dp.hourEnd,
        slotsBooked: slots,
        pctOfTotalBps: 0, // computed below
      };
    });

    // Compute grand total and percentages
    const grandTotal = daypartRows.reduce((sum, dp) => sum + dp.slotsBooked, 0);
    for (const dp of daypartRows) {
      dp.pctOfTotalBps = toBps(safeDivide(dp.slotsBooked, grandTotal));
    }

    return daypartRows;
  });
}
