import { sql, and, eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations } from '@oppsera/db';
import { NotFoundError, ValidationError } from '@oppsera/shared';

export interface AvailableRoomForMove {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  viewType: string | null;
  wing: string | null;
  status: string;
}

export interface AvailableRoomsForMoveResult {
  currentRoom: { roomId: string; roomNumber: string; roomTypeName: string } | null;
  roomTypes: Array<{ id: string; name: string }>;
  rooms: AvailableRoomForMove[];
}

export async function getAvailableRoomsForMove(
  tenantId: string,
  reservationId: string,
): Promise<AvailableRoomsForMoveResult> {
  return withTenant(tenantId, async (tx) => {
    // 1. Load reservation — must be CHECKED_IN with a room assigned
    const [reservation] = await tx
      .select({
        id: pmsReservations.id,
        propertyId: pmsReservations.propertyId,
        roomId: pmsReservations.roomId,
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        status: pmsReservations.status,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.id, reservationId),
          eq(pmsReservations.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!reservation) throw new NotFoundError('Reservation', reservationId);
    if (reservation.status !== 'CHECKED_IN') {
      throw new ValidationError('Room move is only available for checked-in reservations', [
        { field: 'status', message: `Current status is ${reservation.status}, expected CHECKED_IN` },
      ]);
    }
    if (!reservation.roomId) {
      throw new ValidationError('Reservation has no room assigned', [
        { field: 'roomId', message: 'No current room to move from' },
      ]);
    }

    const currentRoomId = reservation.roomId;

    // 2. Load current room info for context
    const currentRows = await tx.execute(sql`
      SELECT r.id AS room_id, r.room_number, rt.name AS room_type_name
      FROM pms_rooms r
      JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      WHERE r.id = ${currentRoomId}
        AND r.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const currentArr = Array.from(currentRows as Iterable<Record<string, unknown>>);
    const currentRoom = currentArr.length > 0
      ? {
          roomId: String(currentArr[0]!.room_id),
          roomNumber: String(currentArr[0]!.room_number),
          roomTypeName: String(currentArr[0]!.room_type_name),
        }
      : null;

    // 3. Remaining dates: today → checkout (for mid-stay moves)
    const today = new Date().toISOString().split('T')[0]!;
    const remainingStart = today > reservation.checkInDate ? today : reservation.checkInDate;

    // 4. Query available rooms across ALL active room types in this property.
    //    Excludes: current room, inactive rooms, out-of-order rooms, inactive room types,
    //    and rooms with conflicting active blocks for the remaining stay dates.
    const rows = await tx.execute(sql`
      SELECT
        r.id            AS room_id,
        r.room_number,
        r.room_type_id,
        rt.name         AS room_type_name,
        r.floor,
        r.view_type,
        r.wing,
        r.status
      FROM pms_rooms r
      JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${reservation.propertyId}
        AND r.is_active = true
        AND r.is_out_of_order = false
        AND rt.is_active = true
        AND r.id != ${currentRoomId}
        AND NOT EXISTS (
          SELECT 1 FROM pms_room_blocks rb
          WHERE rb.room_id = r.id
            AND rb.tenant_id = ${tenantId}
            AND rb.is_active = true
            AND daterange(rb.start_date, rb.end_date, '[)')
                && daterange(${remainingStart}::date, ${reservation.checkOutDate}::date, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM pms_reservations pr
          WHERE pr.room_id = r.id
            AND pr.tenant_id = ${tenantId}
            AND pr.id != ${reservationId}
            AND pr.status NOT IN ('CANCELLED', 'NO_SHOW', 'CHECKED_OUT')
            AND daterange(pr.check_in_date::date, pr.check_out_date::date, '[)')
                && daterange(${remainingStart}::date, ${reservation.checkOutDate}::date, '[)')
        )
      ORDER BY
        rt.name,
        CASE r.status
          WHEN 'VACANT_INSPECTED' THEN 0
          WHEN 'VACANT_CLEAN'     THEN 1
          WHEN 'VACANT_DIRTY'     THEN 2
          ELSE 3
        END,
        r.room_number
    `);

    const available = Array.from(rows as Iterable<Record<string, unknown>>);

    const rooms: AvailableRoomForMove[] = available.map((row) => ({
      roomId: String(row.room_id),
      roomNumber: String(row.room_number),
      roomTypeId: String(row.room_type_id),
      roomTypeName: String(row.room_type_name),
      floor: row.floor ? String(row.floor) : null,
      viewType: row.view_type ? String(row.view_type) : null,
      wing: row.wing ? String(row.wing) : null,
      status: String(row.status),
    }));

    // Build unique room types from results
    const typeMap = new Map<string, string>();
    for (const room of rooms) {
      typeMap.set(room.roomTypeId, room.roomTypeName);
    }
    const roomTypes = Array.from(typeMap.entries()).map(([id, name]) => ({ id, name }));

    return { currentRoom, roomTypes, rooms };
  });
}
