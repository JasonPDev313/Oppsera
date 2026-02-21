import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface RoomDetail {
  id: string;
  tenantId: string;
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
  createdBy: string | null;
  // Room type info
  roomTypeCode: string;
  roomTypeName: string;
  roomTypeMaxAdults: number;
  roomTypeMaxChildren: number;
  roomTypeMaxOccupancy: number;
  roomTypeBedsJson: Array<{ type: string; count: number }> | null;
  roomTypeAmenitiesJson: string[] | null;
}

export async function getRoom(tenantId: string, roomId: string): Promise<RoomDetail> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.tenant_id,
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
        r.created_by,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        rt.max_adults AS room_type_max_adults,
        rt.max_children AS room_type_max_children,
        rt.max_occupancy AS room_type_max_occupancy,
        rt.beds_json AS room_type_beds_json,
        rt.amenities_json AS room_type_amenities_json
      FROM pms_rooms r
      INNER JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      WHERE r.id = ${roomId}
        AND r.tenant_id = ${tenantId}
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      throw new NotFoundError('Room', roomId);
    }

    const row = arr[0]!;
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      propertyId: String(row.property_id),
      roomTypeId: String(row.room_type_id),
      roomNumber: String(row.room_number),
      floor: row.floor ? String(row.floor) : null,
      status: String(row.status),
      isOutOfOrder: Boolean(row.is_out_of_order),
      outOfOrderReason: row.out_of_order_reason ? String(row.out_of_order_reason) : null,
      isActive: Boolean(row.is_active),
      featuresJson: row.features_json as Record<string, unknown> | null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      createdBy: row.created_by ? String(row.created_by) : null,
      roomTypeCode: String(row.room_type_code),
      roomTypeName: String(row.room_type_name),
      roomTypeMaxAdults: Number(row.room_type_max_adults),
      roomTypeMaxChildren: Number(row.room_type_max_children),
      roomTypeMaxOccupancy: Number(row.room_type_max_occupancy),
      roomTypeBedsJson: row.room_type_beds_json as Array<{ type: string; count: number }> | null,
      roomTypeAmenitiesJson: row.room_type_amenities_json as string[] | null,
    };
  });
}
