/**
 * Room availability checking helpers.
 * Used by reservation create, move, resize, and check-in commands.
 */
import { sql } from 'drizzle-orm';
import { RoomAlreadyBookedError, RoomOutOfOrderError } from '../errors';

interface ConflictInfo {
  reservationId: string;
  startDate: string;
  endDate: string;
  blockType: string;
}

/**
 * Check if a room is available for a date range.
 * Uses daterange overlap check against pms_room_blocks.
 * @param excludeReservationId - Exclude this reservation from conflict check (for moves/resizes)
 */
export async function checkRoomAvailability(
  tx: any,
  tenantId: string,
  roomId: string,
  startDate: string,
  endDate: string,
  excludeReservationId?: string,
): Promise<{ available: boolean; conflicts: ConflictInfo[] }> {
  const excludeClause = excludeReservationId
    ? sql`AND (reservation_id IS NULL OR reservation_id != ${excludeReservationId})`
    : sql``;

  const rows = await tx.execute(sql`
    SELECT id, reservation_id, start_date, end_date, block_type
    FROM pms_room_blocks
    WHERE tenant_id = ${tenantId}
      AND room_id = ${roomId}
      AND is_active = true
      AND daterange(start_date, end_date, '[)') && daterange(${startDate}::date, ${endDate}::date, '[)')
      ${excludeClause}
  `);

  const conflicts = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
    reservationId: row.reservation_id ? String(row.reservation_id) : '',
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    blockType: String(row.block_type),
  }));

  return { available: conflicts.length === 0, conflicts };
}

/**
 * Check if a room is available and throw if not.
 */
export async function assertRoomAvailable(
  tx: any,
  tenantId: string,
  roomId: string,
  startDate: string,
  endDate: string,
  excludeReservationId?: string,
): Promise<void> {
  const { available, conflicts } = await checkRoomAvailability(
    tx,
    tenantId,
    roomId,
    startDate,
    endDate,
    excludeReservationId,
  );

  if (!available) {
    throw new RoomAlreadyBookedError(roomId, startDate, endDate);
  }
}

/**
 * Check that a room is not out of order.
 */
export async function checkRoomNotOutOfOrder(
  tx: any,
  tenantId: string,
  roomId: string,
): Promise<void> {
  const rows = await tx.execute(sql`
    SELECT id, is_out_of_order
    FROM pms_rooms
    WHERE tenant_id = ${tenantId}
      AND id = ${roomId}
    LIMIT 1
  `);

  const room = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (room && room.is_out_of_order) {
    throw new RoomOutOfOrderError(roomId);
  }
}

/**
 * Suggest available rooms for a date range and room type.
 */
export async function suggestAvailableRooms(
  tx: any,
  tenantId: string,
  propertyId: string,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  limit: number = 10,
): Promise<Array<{ roomId: string; roomNumber: string; floor: string | null }>> {
  const rows = await tx.execute(sql`
    SELECT r.id AS room_id, r.room_number, r.floor
    FROM pms_rooms r
    WHERE r.tenant_id = ${tenantId}
      AND r.property_id = ${propertyId}
      AND r.room_type_id = ${roomTypeId}
      AND r.is_active = true
      AND r.is_out_of_order = false
      AND NOT EXISTS (
        SELECT 1 FROM pms_room_blocks rb
        WHERE rb.room_id = r.id
          AND rb.is_active = true
          AND daterange(rb.start_date, rb.end_date, '[)') && daterange(${checkInDate}::date, ${checkOutDate}::date, '[)')
      )
    ORDER BY r.room_number
    LIMIT ${limit}
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
    roomId: String(row.room_id),
    roomNumber: String(row.room_number),
    floor: row.floor ? String(row.floor) : null,
  }));
}
