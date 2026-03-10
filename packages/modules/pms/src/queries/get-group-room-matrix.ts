import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GroupRoomMatrixCell {
  blockDate: string;
  totalAvailable: number;
  roomsBlocked: number;
  roomsPickedUp: number;
  released: boolean;
}

export interface GroupRoomMatrixRoomType {
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  cells: GroupRoomMatrixCell[];
  totals: {
    totalAvailable: number;
    roomsBlocked: number;
    roomsPickedUp: number;
  };
}

export interface GroupRoomMatrixResult {
  groupId: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  roomTypes: GroupRoomMatrixRoomType[];
}

export async function getGroupRoomMatrix(
  tenantId: string,
  groupId: string,
): Promise<GroupRoomMatrixResult> {
  return withTenant(tenantId, async (tx) => {
    // Fetch group to validate + get date range
    const groupRows = await tx.execute(sql`
      SELECT id, property_id, start_date, end_date
      FROM pms_groups
      WHERE id = ${groupId} AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const groupArr = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (groupArr.length === 0) throw new NotFoundError('Group', groupId);
    const group = groupArr[0]!;

    // Fetch blocks joined to room types, also compute total available per room type/date
    const rows = await tx.execute(sql`
      SELECT
        b.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        rt.sort_order,
        b.block_date,
        b.rooms_blocked,
        b.rooms_picked_up,
        b.released,
        (
          SELECT COUNT(*) FROM pms_rooms r
          WHERE r.tenant_id = ${tenantId}
            AND r.room_type_id = b.room_type_id
            AND r.is_active = true
            AND r.id NOT IN (
              SELECT rb.room_id FROM pms_room_blocks rb
              WHERE rb.tenant_id = ${tenantId}
                AND rb.is_active = true
                AND rb.start_date <= b.block_date
                AND rb.end_date > b.block_date
                AND rb.block_type = 'OOO'
            )
        ) AS total_available
      FROM pms_group_room_blocks b
      INNER JOIN pms_room_types rt ON rt.id = b.room_type_id AND rt.tenant_id = b.tenant_id
      WHERE b.group_id = ${groupId}
        AND b.tenant_id = ${tenantId}
      ORDER BY rt.sort_order ASC, b.block_date ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    // Group by room type
    const roomTypeMap = new Map<string, GroupRoomMatrixRoomType>();

    for (const row of arr) {
      const rtId = String(row.room_type_id);
      if (!roomTypeMap.has(rtId)) {
        roomTypeMap.set(rtId, {
          roomTypeId: rtId,
          roomTypeCode: String(row.room_type_code),
          roomTypeName: String(row.room_type_name),
          cells: [],
          totals: { totalAvailable: 0, roomsBlocked: 0, roomsPickedUp: 0 },
        });
      }
      const rt = roomTypeMap.get(rtId)!;
      const roomsBlocked = Number(row.rooms_blocked);
      const roomsPickedUp = Number(row.rooms_picked_up);
      const totalAvailable = Number(row.total_available ?? 0);

      rt.cells.push({
        blockDate: String(row.block_date),
        totalAvailable,
        roomsBlocked,
        roomsPickedUp,
        released: Boolean(row.released),
      });
      rt.totals.totalAvailable += totalAvailable;
      rt.totals.roomsBlocked += roomsBlocked;
      rt.totals.roomsPickedUp += roomsPickedUp;
    }

    return {
      groupId,
      propertyId: String(group.property_id),
      startDate: String(group.start_date),
      endDate: String(group.end_date),
      roomTypes: Array.from(roomTypeMap.values()),
    };
  });
}
