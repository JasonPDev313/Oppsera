/**
 * Housekeeping board query — returns room status + guest info for a property.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

interface HousekeepingRoomRow {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  currentGuest: { name: string; checkOutDate: string } | null;
  arrivingGuest: { name: string; checkInDate: string } | null;
  departingToday: boolean;
  arrivingToday: boolean;
}

export async function listHousekeepingRooms(
  tenantId: string,
  propertyId: string,
  date: string,
  statusFilter?: string,
): Promise<HousekeepingRoomRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        r.id AS room_id,
        r.room_number,
        rt.name AS room_type_name,
        r.floor,
        r.status,
        r.is_out_of_order,
        -- Current guest (checked in, occupying this room)
        ci.primary_guest_json AS current_guest_json,
        ci.check_out_date AS current_check_out_date,
        -- Arriving guest (confirmed, check-in today)
        ai.primary_guest_json AS arriving_guest_json,
        ai.check_in_date AS arriving_check_in_date,
        -- Flags
        CASE WHEN ci.check_out_date = ${date} THEN true ELSE false END AS departing_today,
        CASE WHEN ai.check_in_date = ${date} THEN true ELSE false END AS arriving_today
      FROM pms_rooms r
      JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      LEFT JOIN pms_reservations ci ON ci.room_id = r.id
        AND ci.tenant_id = r.tenant_id
        AND ci.status = 'CHECKED_IN'
      LEFT JOIN pms_reservations ai ON ai.room_id = r.id
        AND ai.tenant_id = r.tenant_id
        AND ai.status = 'CONFIRMED'
        AND ai.check_in_date = ${date}
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.is_active = true
        ${statusFilter ? sql`AND r.status = ${statusFilter}` : sql``}
      ORDER BY r.room_number
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => {
      const currentGuestJson = row.current_guest_json as Record<string, string> | null;
      const arrivingGuestJson = row.arriving_guest_json as Record<string, string> | null;

      return {
        roomId: String(row.room_id),
        roomNumber: String(row.room_number),
        roomTypeName: String(row.room_type_name),
        floor: row.floor ? String(row.floor) : null,
        status: String(row.status),
        isOutOfOrder: Boolean(row.is_out_of_order),
        currentGuest: currentGuestJson
          ? {
              name: `${currentGuestJson.firstName ?? ''} ${currentGuestJson.lastName ?? ''}`.trim(),
              checkOutDate: String(row.current_check_out_date),
            }
          : null,
        arrivingGuest: arrivingGuestJson
          ? {
              name: `${arrivingGuestJson.firstName ?? ''} ${arrivingGuestJson.lastName ?? ''}`.trim(),
              checkInDate: String(row.arriving_check_in_date),
            }
          : null,
        departingToday: Boolean(row.departing_today),
        arrivingToday: Boolean(row.arriving_today),
      };
    });
  });
}
