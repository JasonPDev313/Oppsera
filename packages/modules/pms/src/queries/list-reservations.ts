import { sql, and, eq, desc, gte, lte } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations, pmsRooms, pmsRoomTypes } from '@oppsera/db';

interface ListReservationsInput {
  tenantId: string;
  propertyId: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  guestId?: string;
  roomId?: string;
  cursor?: string;
  limit?: number;
}

export async function listReservations(input: ListReservationsInput) {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(pmsReservations.tenantId, input.tenantId),
      eq(pmsReservations.propertyId, input.propertyId),
    ];

    if (input.status) {
      conditions.push(eq(pmsReservations.status, input.status));
    }
    if (input.fromDate) {
      conditions.push(gte(pmsReservations.checkInDate, input.fromDate));
    }
    if (input.toDate) {
      conditions.push(lte(pmsReservations.checkInDate, input.toDate));
    }
    if (input.guestId) {
      conditions.push(eq(pmsReservations.guestId, input.guestId));
    }
    if (input.roomId) {
      conditions.push(eq(pmsReservations.roomId, input.roomId));
    }
    if (input.cursor) {
      conditions.push(lte(pmsReservations.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: pmsReservations.id,
        propertyId: pmsReservations.propertyId,
        guestId: pmsReservations.guestId,
        primaryGuestJson: pmsReservations.primaryGuestJson,
        roomId: pmsReservations.roomId,
        roomTypeId: pmsReservations.roomTypeId,
        ratePlanId: pmsReservations.ratePlanId,
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        adults: pmsReservations.adults,
        children: pmsReservations.children,
        nights: pmsReservations.nights,
        nightlyRateCents: pmsReservations.nightlyRateCents,
        subtotalCents: pmsReservations.subtotalCents,
        taxCents: pmsReservations.taxCents,
        totalCents: pmsReservations.totalCents,
        status: pmsReservations.status,
        sourceType: pmsReservations.sourceType,
        version: pmsReservations.version,
        createdAt: pmsReservations.createdAt,
        roomNumber: pmsRooms.roomNumber,
        roomTypeName: pmsRoomTypes.name,
      })
      .from(pmsReservations)
      .leftJoin(pmsRooms, and(eq(pmsReservations.roomId, pmsRooms.id), eq(pmsRooms.tenantId, pmsReservations.tenantId)))
      .leftJoin(pmsRoomTypes, and(eq(pmsReservations.roomTypeId, pmsRoomTypes.id), eq(pmsRoomTypes.tenantId, pmsReservations.tenantId)))
      .where(and(...conditions))
      .orderBy(desc(pmsReservations.checkInDate), desc(pmsReservations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
