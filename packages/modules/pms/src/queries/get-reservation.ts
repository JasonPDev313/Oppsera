import { and, eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  pmsReservations,
  pmsRooms,
  pmsRoomTypes,
  pmsRatePlans,
  pmsGuests,
  pmsFolios,
} from '@oppsera/db';

export async function getReservation(tenantId: string, reservationId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
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
        feeCents: pmsReservations.feeCents,
        totalCents: pmsReservations.totalCents,
        status: pmsReservations.status,
        sourceType: pmsReservations.sourceType,
        internalNotes: pmsReservations.internalNotes,
        guestNotes: pmsReservations.guestNotes,
        version: pmsReservations.version,
        createdBy: pmsReservations.createdBy,
        createdAt: pmsReservations.createdAt,
        updatedAt: pmsReservations.updatedAt,
        // Joined
        roomNumber: pmsRooms.roomNumber,
        roomFloor: pmsRooms.floor,
        roomTypeName: pmsRoomTypes.name,
        roomTypeCode: pmsRoomTypes.code,
        ratePlanName: pmsRatePlans.name,
        ratePlanCode: pmsRatePlans.code,
        guestFirstName: pmsGuests.firstName,
        guestLastName: pmsGuests.lastName,
        guestEmail: pmsGuests.email,
        guestCustomerId: pmsGuests.customerId,
        folioId: pmsFolios.id,
        folioStatus: pmsFolios.status,
        folioTotalCents: pmsFolios.totalCents,
      })
      .from(pmsReservations)
      .leftJoin(pmsRooms, eq(pmsReservations.roomId, pmsRooms.id))
      .leftJoin(pmsRoomTypes, eq(pmsReservations.roomTypeId, pmsRoomTypes.id))
      .leftJoin(pmsRatePlans, eq(pmsReservations.ratePlanId, pmsRatePlans.id))
      .leftJoin(pmsGuests, eq(pmsReservations.guestId, pmsGuests.id))
      .leftJoin(pmsFolios, eq(pmsFolios.reservationId, pmsReservations.id))
      .where(
        and(
          eq(pmsReservations.id, reservationId),
          eq(pmsReservations.tenantId, tenantId),
        ),
      )
      .limit(1);

    return row ?? null;
  });
}
