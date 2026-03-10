import { and, eq, desc, gte, lte, sql } from 'drizzle-orm';
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

/** Encode composite cursor as `checkInDate|id` */
function encodeCursor(checkInDate: string, id: string): string {
  return `${checkInDate}|${id}`;
}

/** Decode composite cursor — falls back to id-only for backwards compatibility */
function decodeCursor(cursor: string): { cursorDate: string; cursorId: string } | null {
  const sep = cursor.indexOf('|');
  if (sep === -1) {
    // Legacy id-only cursor — still works but less precise
    return null;
  }
  return { cursorDate: cursor.slice(0, sep), cursorId: cursor.slice(sep + 1) };
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
      const decoded = decodeCursor(input.cursor);
      if (decoded) {
        // Composite keyset cursor: (check_in_date, id) < (cursorDate, cursorId)
        conditions.push(
          sql`(${pmsReservations.checkInDate}, ${pmsReservations.id}) < (${decoded.cursorDate}, ${decoded.cursorId})`,
        );
      } else {
        // Legacy id-only cursor for backwards compatibility
        conditions.push(sql`${pmsReservations.id} < ${input.cursor}`);
      }
    }

    const rows = await tx
      .select({
        id: pmsReservations.id,
        propertyId: pmsReservations.propertyId,
        confirmationNumber: pmsReservations.confirmationNumber,
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
        doNotMove: pmsReservations.doNotMove,
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
    const last = items[items.length - 1];

    return {
      items,
      cursor: hasMore && last ? encodeCursor(String(last.checkInDate), last.id) : null,
      hasMore,
    };
  });
}
