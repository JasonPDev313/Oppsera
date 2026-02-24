/**
 * Forward-looking occupancy forecast from confirmed reservations.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations, pmsRooms } from '@oppsera/db';

export interface OccupancyForecastDay {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  arrivals: number;
  departures: number;
}

export async function getOccupancyForecast(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<OccupancyForecastDay[]> {
  return withTenant(tenantId, async (tx) => {
    // Get total sellable rooms
    const roomCountResult = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pmsRooms)
      .where(and(eq(pmsRooms.tenantId, tenantId), eq(pmsRooms.propertyId, propertyId)));
    const totalRooms = roomCountResult[0]?.count ?? 0;

    // Get reservations that overlap the date range (active statuses only)
    const activeStatuses = ['CONFIRMED', 'CHECKED_IN'];
    const reservations = await tx
      .select({
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          lte(pmsReservations.checkInDate, endDate),
          gte(pmsReservations.checkOutDate, startDate),
          sql`${pmsReservations.status} = ANY(${activeStatuses})`,
        ),
      );

    // Build date map
    const result: OccupancyForecastDay[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]!;
      let occupied = 0;
      let arrivals = 0;
      let departures = 0;

      for (const r of reservations) {
        if (r.checkInDate <= dateStr && r.checkOutDate > dateStr) {
          occupied++;
        }
        if (r.checkInDate === dateStr) arrivals++;
        if (r.checkOutDate === dateStr) departures++;
      }

      result.push({
        date: dateStr,
        totalRooms,
        occupiedRooms: occupied,
        occupancyPct: totalRooms > 0 ? Math.round((occupied / totalRooms) * 10000) / 100 : 0,
        arrivals,
        departures,
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  });
}
