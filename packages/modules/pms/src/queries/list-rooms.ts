import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface RoomListItem {
  id: string;
  propertyId: string;
  roomTypeId: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  outOfOrderReason: string | null;
  isActive: boolean;
  featuresJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Room type info
  roomTypeCode: string;
  roomTypeName: string;
}

interface ListRoomsInput {
  tenantId: string;
  propertyId: string;
  status?: string;
  roomTypeId?: string;
  isOutOfOrder?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListRoomsResult {
  items: RoomListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listRooms(input: ListRoomsInput): Promise<ListRoomsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`r.tenant_id = ${input.tenantId}`,
      sql`r.property_id = ${input.propertyId}`,
    ];

    if (input.status) {
      conditions.push(sql`r.status = ${input.status}`);
    }
    if (input.roomTypeId) {
      conditions.push(sql`r.room_type_id = ${input.roomTypeId}`);
    }
    if (input.isOutOfOrder !== undefined) {
      conditions.push(sql`r.is_out_of_order = ${input.isOutOfOrder}`);
    }
    if (input.cursor) {
      conditions.push(sql`r.id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.property_id,
        r.room_type_id,
        r.room_number,
        r.floor,
        r.status,
        r.is_out_of_order,
        r.out_of_order_reason,
        r.is_active,
        r.features_json,
        r.created_at,
        r.updated_at,
        rt.code AS room_type_code,
        rt.name AS room_type_name
      FROM pms_rooms r
      INNER JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      WHERE ${whereClause}
      ORDER BY r.room_number ASC, r.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        propertyId: String(r.property_id),
        roomTypeId: String(r.room_type_id),
        roomNumber: String(r.room_number),
        floor: r.floor ? String(r.floor) : null,
        status: String(r.status),
        isOutOfOrder: Boolean(r.is_out_of_order),
        outOfOrderReason: r.out_of_order_reason ? String(r.out_of_order_reason) : null,
        isActive: Boolean(r.is_active),
        featuresJson: r.features_json as Record<string, unknown> | null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        roomTypeCode: String(r.room_type_code),
        roomTypeName: String(r.room_type_name),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
