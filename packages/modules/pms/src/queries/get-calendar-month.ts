import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface MonthDay {
  date: string;
  totalRooms: number;
  roomsOccupied: number;
  roomsAvailable: number;
  roomsOoo: number;
  occupancyPct: number;
  arrivals: number;
  departures: number;
  adrCents: number;
  revparCents: number;
}

export interface CalendarMonthResult {
  year: number;
  month: number;
  days: MonthDay[];
}

/**
 * Returns occupancy data for a full calendar month grid (~35 days
 * to cover the first/last partial weeks).
 */
export async function getCalendarMonth(
  tenantId: string,
  propertyId: string,
  year: number,
  month: number,
): Promise<CalendarMonthResult> {
  return withTenant(tenantId, async (tx) => {
    // Compute start = first day of the month, end = last day of the month
    // We fetch extra days on each side for the full calendar grid (up to 6 weeks)
    const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;

    // Build start of the first week (could be a few days before the month)
    // and end of the last week (could be a few days after the month)
    const rows = await tx.execute(sql`
      SELECT
        business_date,
        total_rooms,
        rooms_occupied,
        rooms_available,
        rooms_ooo,
        occupancy_pct,
        arrivals,
        departures,
        adr_cents,
        revpar_cents
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date >= (DATE ${firstOfMonth} - INTERVAL '6 days')::date
        AND business_date <= (DATE ${firstOfMonth} + INTERVAL '37 days')::date
      ORDER BY business_date ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    return {
      year,
      month,
      days: arr.map((r) => ({
        date: String(r.business_date),
        totalRooms: Number(r.total_rooms ?? 0),
        roomsOccupied: Number(r.rooms_occupied ?? 0),
        roomsAvailable: Number(r.rooms_available ?? 0),
        roomsOoo: Number(r.rooms_ooo ?? 0),
        occupancyPct: Number(r.occupancy_pct ?? 0),
        arrivals: Number(r.arrivals ?? 0),
        departures: Number(r.departures ?? 0),
        adrCents: Number(r.adr_cents ?? 0),
        revparCents: Number(r.revpar_cents ?? 0),
      })),
    };
  });
}
