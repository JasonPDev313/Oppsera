/**
 * Pickup report — rooms booked since a snapshot date for target dates.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations } from '@oppsera/db';

export interface PickupReportRow {
  targetDate: string;
  roomsBookedSinceSnapshot: number;
  totalRoomsBooked: number;
}

export async function getPickupReport(
  tenantId: string,
  propertyId: string,
  snapshotDate: string,
  startDate: string,
  endDate: string,
): Promise<PickupReportRow[]> {
  return withTenant(tenantId, async (tx) => {
    const result: PickupReportRow[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]!;

      // Total rooms for this date
      const [totalRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pmsReservations)
        .where(
          and(
            eq(pmsReservations.tenantId, tenantId),
            eq(pmsReservations.propertyId, propertyId),
            lte(pmsReservations.checkInDate, dateStr),
            gte(pmsReservations.checkOutDate, dateStr),
            sql`${pmsReservations.status} != 'CANCELLED'`,
          ),
        );

      // Rooms booked since snapshot
      const [pickupRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pmsReservations)
        .where(
          and(
            eq(pmsReservations.tenantId, tenantId),
            eq(pmsReservations.propertyId, propertyId),
            lte(pmsReservations.checkInDate, dateStr),
            gte(pmsReservations.checkOutDate, dateStr),
            sql`${pmsReservations.status} != 'CANCELLED'`,
            gte(pmsReservations.createdAt, new Date(snapshotDate)),
          ),
        );

      result.push({
        targetDate: dateStr,
        roomsBookedSinceSnapshot: pickupRow?.count ?? 0,
        totalRoomsBooked: totalRow?.count ?? 0,
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  });
}
