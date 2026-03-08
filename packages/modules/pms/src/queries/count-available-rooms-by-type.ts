import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface RoomTypeAvailabilityCount {
  roomTypeId: string;
  availableCount: number;
}

/**
 * Counts available (non-blocked, non-OOO, active) rooms per room type
 * for a given date range. Used to show availability in room type dropdowns.
 */
export async function countAvailableRoomsByType(
  tenantId: string,
  propertyId: string,
  checkInDate: string,
  checkOutDate: string,
): Promise<RoomTypeAvailabilityCount[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT r.room_type_id, COUNT(*)::int AS available_count
      FROM pms_rooms r
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
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
      GROUP BY r.room_type_id
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      roomTypeId: String(row.room_type_id),
      availableCount: Number(row.available_count),
    }));
  });
}
