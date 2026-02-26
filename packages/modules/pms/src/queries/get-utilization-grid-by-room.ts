import { withTenant, sql } from '@oppsera/db';

// ---------- Types ----------

export interface UtilizationRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  floor: number | null;
  status: string;
  viewType: string | null;
  sortOrder: number;
}

export interface UtilizationRoomCell {
  date: string;
  roomId: string;
  isOccupied: boolean;
  isBlocked: boolean;
  isAvailable: boolean;
  guestName: string | null;
  reservationId: string | null;
}

export interface UtilizationByRoomResponse {
  propertyId: string;
  startDate: string;
  endDate: string;
  rooms: UtilizationRoom[];
  cells: UtilizationRoomCell[];
  meta: {
    totalRooms: number;
    lastUpdatedAt: string;
  };
}

// ---------- Helpers ----------

function toDateString(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]!;
  }
  return String(val ?? '');
}

// ---------- Query ----------

/**
 * Compute a utilization grid at the individual ROOM level.
 * For every (date, room) pair within the range, return whether
 * the room is occupied, blocked, or available.
 *
 * Rooms are sorted by roomType.sortOrder then roomNumber.
 */
export async function getUtilizationGridByRoom(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<UtilizationByRoomResponse> {
  return withTenant(tenantId, async (tx) => {
    const [roomRows, occupiedRows, blockedRows] = await Promise.all([
      // Sub-query 1: Active rooms with their room type info
      tx.execute(sql`
        SELECT
          r.id AS room_id,
          r.room_number,
          r.room_type_id,
          rt.name AS room_type_name,
          rt.code AS room_type_code,
          r.floor,
          r.status,
          r.view_type,
          rt.sort_order
        FROM pms_rooms r
        JOIN pms_room_types rt ON rt.id = r.room_type_id
        WHERE r.tenant_id = ${tenantId}
          AND r.property_id = ${propertyId}
          AND r.is_active = true
          AND r.is_out_of_order = false
          AND rt.is_active = true
        ORDER BY rt.sort_order, r.room_number
      `),

      // Sub-query 2: Occupied per (date, room) with guest name
      tx.execute(sql`
        SELECT
          to_char(d.d, 'YYYY-MM-DD') AS cal_date,
          r.id AS room_id,
          res.id AS reservation_id,
          res.primary_guest_json->>'lastName' AS guest_last_name
        FROM generate_series(${startDate}::date, ${endDate}::date - interval '1 day', '1 day') AS d(d)
        CROSS JOIN pms_rooms r
        LEFT JOIN pms_reservations res
          ON res.tenant_id = ${tenantId}
          AND res.property_id = ${propertyId}
          AND res.room_id = r.id
          AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
          AND res.check_in_date <= d.d
          AND res.check_out_date > d.d
        WHERE r.tenant_id = ${tenantId}
          AND r.property_id = ${propertyId}
          AND r.is_active = true
          AND r.is_out_of_order = false
      `),

      // Sub-query 3: Blocked per (date, room) from room_blocks
      tx.execute(sql`
        SELECT
          to_char(d.d, 'YYYY-MM-DD') AS cal_date,
          rb.room_id
        FROM generate_series(${startDate}::date, ${endDate}::date - interval '1 day', '1 day') AS d(d)
        JOIN pms_room_blocks rb
          ON rb.tenant_id = ${tenantId}
          AND rb.property_id = ${propertyId}
          AND rb.is_active = true
          AND rb.start_date <= d.d
          AND rb.end_date > d.d
        JOIN pms_rooms r
          ON r.id = rb.room_id
          AND r.is_active = true
          AND r.is_out_of_order = false
      `),
    ]);

    // Parse rooms
    const rooms: UtilizationRoom[] = Array.from(
      roomRows as Iterable<any>,
    ).map((r) => ({
      id: r.room_id,
      roomNumber: r.room_number ?? '',
      roomTypeId: r.room_type_id,
      roomTypeName: r.room_type_name ?? '',
      roomTypeCode: r.room_type_code ?? '',
      floor: r.floor != null ? Number(r.floor) : null,
      status: r.status ?? 'clean',
      viewType: r.view_type ?? null,
      sortOrder: Number(r.sort_order ?? 0),
    }));

    // Build lookup: "date:roomId" → { reservationId, guestName }
    const occupiedMap = new Map<string, { reservationId: string; guestName: string | null }>();
    for (const row of Array.from(occupiedRows as Iterable<any>)) {
      if (!row.reservation_id) continue;
      const key = `${toDateString(row.cal_date)}:${row.room_id}`;
      occupiedMap.set(key, {
        reservationId: row.reservation_id,
        guestName: row.guest_last_name ?? null,
      });
    }

    // Build lookup: "date:roomId" → blocked
    const blockedSet = new Set<string>();
    for (const row of Array.from(blockedRows as Iterable<any>)) {
      const key = `${toDateString(row.cal_date)}:${row.room_id}`;
      blockedSet.add(key);
    }

    // Generate the date spine and assemble cells
    const cells: UtilizationRoomCell[] = [];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');

    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]!;

      for (const room of rooms) {
        const key = `${dateStr}:${room.id}`;
        const occ = occupiedMap.get(key);
        const isOccupied = !!occ;
        const isBlocked = blockedSet.has(key);

        cells.push({
          date: dateStr,
          roomId: room.id,
          isOccupied,
          isBlocked,
          isAvailable: !isOccupied && !isBlocked,
          guestName: occ?.guestName ?? null,
          reservationId: occ?.reservationId ?? null,
        });
      }
    }

    return {
      propertyId,
      startDate,
      endDate,
      rooms,
      cells,
      meta: {
        totalRooms: rooms.length,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  });
}
