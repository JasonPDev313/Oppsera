/**
 * No-show report with revenue impact.
 */
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations, pmsGuests, pmsRoomTypes } from '@oppsera/db';

export interface NoShowReportRow {
  reservationId: string;
  confirmationNumber: string | null;
  guestName: string;
  roomTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nightCount: number;
  estimatedRevenueCents: number;
}

export interface NoShowReportResult {
  items: NoShowReportRow[];
  totalNoShows: number;
  totalLostRevenueCents: number;
}

export async function getNoShowReport(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<NoShowReportResult> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: pmsReservations.id,
        confirmationNumber: pmsReservations.confirmationNumber,
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        totalCents: pmsReservations.totalCents,
        guestFirstName: pmsGuests.firstName,
        guestLastName: pmsGuests.lastName,
        roomTypeName: pmsRoomTypes.name,
      })
      .from(pmsReservations)
      .leftJoin(pmsGuests, eq(pmsReservations.guestId, pmsGuests.id))
      .leftJoin(pmsRoomTypes, eq(pmsReservations.roomTypeId, pmsRoomTypes.id))
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          eq(pmsReservations.status, 'NO_SHOW'),
          gte(pmsReservations.checkInDate, startDate),
          lte(pmsReservations.checkInDate, endDate),
        ),
      )
      .orderBy(desc(pmsReservations.checkInDate));

    const items: NoShowReportRow[] = rows.map((r) => {
      const checkIn = new Date(r.checkInDate);
      const checkOut = new Date(r.checkOutDate);
      const nightCount = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        reservationId: r.id,
        confirmationNumber: r.confirmationNumber,
        guestName: [r.guestFirstName, r.guestLastName].filter(Boolean).join(' ') || 'Unknown',
        roomTypeName: r.roomTypeName ?? 'Unknown',
        checkInDate: r.checkInDate,
        checkOutDate: r.checkOutDate,
        nightCount,
        estimatedRevenueCents: r.totalCents ?? 0,
      };
    });

    return {
      items,
      totalNoShows: items.length,
      totalLostRevenueCents: items.reduce((sum, i) => sum + i.estimatedRevenueCents, 0),
    };
  });
}
