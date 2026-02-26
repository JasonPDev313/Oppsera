import { withTenant, sql } from '@oppsera/db';

// ---------- Types ----------

export interface UtilizationRoomType {
  id: string;
  name: string;
  code: string;
  maxOccupancy: number;
  sortOrder: number;
  totalRooms: number;
}

export interface UtilizationCell {
  date: string;
  roomTypeId: string;
  totalRooms: number;
  occupied: number;
  blocked: number;
  available: number;
  availablePct: number;
}

export interface UtilizationGridResponse {
  propertyId: string;
  startDate: string;
  endDate: string;
  roomTypes: UtilizationRoomType[];
  cells: UtilizationCell[];
  meta: {
    totalPropertyRooms: number;
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
 * Compute a utilization grid: for every (date, roomType) pair within the range,
 * return total rooms, occupied count, blocked count, and derived availability.
 *
 * Uses 3 parallel sub-queries inside one withTenant call:
 *   1. Room inventory by type (static counts)
 *   2. Occupied count per (date, roomType) via generate_series
 *   3. Blocked count per (date, roomType) via generate_series + room_blocks
 */
export async function getUtilizationGrid(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<UtilizationGridResponse> {
  return withTenant(tenantId, async (tx) => {
    const [inventoryRows, occupiedRows, blockedRows] = await Promise.all([
      // Sub-query 1: Room inventory by type
      tx.execute(sql`
        SELECT
          rt.id AS room_type_id,
          rt.name,
          rt.code,
          rt.max_occupancy,
          rt.sort_order,
          COUNT(r.id)::int AS total_rooms
        FROM pms_room_types rt
        LEFT JOIN pms_rooms r
          ON r.room_type_id = rt.id
          AND r.tenant_id = ${tenantId}
          AND r.property_id = ${propertyId}
          AND r.is_active = true
        WHERE rt.tenant_id = ${tenantId}
          AND rt.property_id = ${propertyId}
          AND rt.is_active = true
        GROUP BY rt.id, rt.name, rt.code, rt.max_occupancy, rt.sort_order
        ORDER BY rt.sort_order, rt.name
      `),

      // Sub-query 2: Occupied count per (date, roomType)
      // Counts both assigned reservations (room_id → room.room_type_id)
      // and unassigned reservations (room_type_id directly, room_id IS NULL)
      tx.execute(sql`
        SELECT
          to_char(d.d, 'YYYY-MM-DD') AS cal_date,
          rt.id AS room_type_id,
          COUNT(DISTINCT CASE WHEN res.room_id IS NOT NULL THEN res.room_id END)::int AS assigned_occupied,
          COUNT(DISTINCT CASE WHEN res.room_id IS NULL THEN res.id END)::int AS unassigned_occupied
        FROM generate_series(${startDate}::date, ${endDate}::date - interval '1 day', '1 day') AS d(d)
        CROSS JOIN pms_room_types rt
        LEFT JOIN pms_reservations res
          ON res.tenant_id = ${tenantId}
          AND res.property_id = ${propertyId}
          AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
          AND res.check_in_date <= d.d
          AND res.check_out_date > d.d
          AND (
            (res.room_id IS NOT NULL AND res.room_id IN (
              SELECT r.id FROM pms_rooms r
              WHERE r.room_type_id = rt.id
                AND r.tenant_id = ${tenantId}
                AND r.is_active = true
            ))
            OR
            (res.room_id IS NULL AND res.room_type_id = rt.id)
          )
        WHERE rt.tenant_id = ${tenantId}
          AND rt.property_id = ${propertyId}
          AND rt.is_active = true
        GROUP BY d.d, rt.id
        ORDER BY d.d, rt.id
      `),

      // Sub-query 3: Blocked rooms per (date, roomType) from room_blocks
      tx.execute(sql`
        SELECT
          to_char(d.d, 'YYYY-MM-DD') AS cal_date,
          r.room_type_id,
          COUNT(DISTINCT rb.room_id)::int AS blocked_count
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
        GROUP BY d.d, r.room_type_id
      `),
    ]);

    // Parse room types
    const roomTypes: UtilizationRoomType[] = Array.from(
      inventoryRows as Iterable<any>,
    ).map((r) => ({
      id: r.room_type_id,
      name: r.name,
      code: r.code ?? '',
      maxOccupancy: Number(r.max_occupancy ?? 1),
      sortOrder: Number(r.sort_order ?? 0),
      totalRooms: Number(r.total_rooms ?? 0),
    }));

    const totalPropertyRooms = roomTypes.reduce((sum, rt) => sum + rt.totalRooms, 0);

    // Build lookup: roomTypeId → totalRooms
    const inventoryMap = new Map<string, number>();
    for (const rt of roomTypes) {
      inventoryMap.set(rt.id, rt.totalRooms);
    }

    // Build lookup: "date:roomTypeId" → occupied count
    const occupiedMap = new Map<string, number>();
    for (const row of Array.from(occupiedRows as Iterable<any>)) {
      const key = `${toDateString(row.cal_date)}:${row.room_type_id}`;
      const assigned = Number(row.assigned_occupied ?? 0);
      const unassigned = Number(row.unassigned_occupied ?? 0);
      occupiedMap.set(key, assigned + unassigned);
    }

    // Build lookup: "date:roomTypeId" → blocked count
    const blockedMap = new Map<string, number>();
    for (const row of Array.from(blockedRows as Iterable<any>)) {
      const key = `${toDateString(row.cal_date)}:${row.room_type_id}`;
      blockedMap.set(key, Number(row.blocked_count ?? 0));
    }

    // Generate the date spine and assemble cells
    const cells: UtilizationCell[] = [];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');

    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]!;

      for (const rt of roomTypes) {
        const key = `${dateStr}:${rt.id}`;
        const total = inventoryMap.get(rt.id) ?? 0;
        const occupied = occupiedMap.get(key) ?? 0;
        const blocked = blockedMap.get(key) ?? 0;
        const available = Math.max(0, total - occupied - blocked);
        const availablePct = total > 0 ? Math.round((available / total) * 100) : 0;

        cells.push({
          date: dateStr,
          roomTypeId: rt.id,
          totalRooms: total,
          occupied,
          blocked,
          available,
          availablePct,
        });
      }
    }

    return {
      propertyId,
      startDate,
      endDate,
      roomTypes,
      cells,
      meta: {
        totalPropertyRooms,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  });
}
