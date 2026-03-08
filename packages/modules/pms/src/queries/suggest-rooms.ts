import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SuggestedRoom {
  roomId: string;
  roomNumber: string;
  floor: string | null;
  status: string;
}

export async function suggestAvailableRooms(
  tenantId: string,
  propertyId: string,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  limit: number = 50,
): Promise<SuggestedRoom[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT r.id AS room_id, r.room_number, r.floor, r.status
      FROM pms_rooms r
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.room_type_id = ${roomTypeId}
        AND r.is_active = true
        AND r.is_out_of_order = false
        AND NOT EXISTS (
          SELECT 1 FROM pms_room_blocks rb
          WHERE rb.room_id = r.id
            AND rb.tenant_id = ${tenantId}
            AND rb.is_active = true
            AND daterange(rb.start_date, rb.end_date, '[)') && daterange(${checkInDate}::date, ${checkOutDate}::date, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM pms_reservations pr
          WHERE pr.room_id = r.id
            AND pr.tenant_id = ${tenantId}
            AND pr.status NOT IN ('CANCELLED', 'NO_SHOW', 'CHECKED_OUT')
            AND daterange(pr.check_in_date::date, pr.check_out_date::date, '[)')
                && daterange(${checkInDate}::date, ${checkOutDate}::date, '[)')
        )
      ORDER BY
        CASE r.status
          WHEN 'VACANT_INSPECTED' THEN 0
          WHEN 'VACANT_CLEAN'     THEN 1
          WHEN 'VACANT_DIRTY'     THEN 2
          ELSE 3
        END,
        r.room_number
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      roomId: String(row.room_id),
      roomNumber: String(row.room_number),
      floor: row.floor ? String(row.floor) : null,
      status: String(row.status),
    }));
  });
}
