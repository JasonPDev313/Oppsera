import { withTenant, sql } from '@oppsera/db';
import type { CalendarRoom, CalendarSegment, OooBlock, OccupancyByDate } from './calendar-week';

export interface CalendarDayResponse {
  date: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  occupancy: OccupancyByDate | null;
}

export async function getCalendarDay(
  tenantId: string,
  propertyId: string,
  date: string,
): Promise<CalendarDayResponse> {
  return withTenant(tenantId, async (tx) => {
    // Query 1: Active rooms with room type info
    const roomRows = await tx.execute(sql`
      SELECT r.id AS room_id, r.room_number, r.room_type_id,
             rt.name AS room_type_name, r.floor, r.status,
             r.is_out_of_order
      FROM pms_rooms r
      JOIN pms_room_types rt ON rt.id = r.room_type_id
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.is_active = true
      ORDER BY rt.sort_order, rt.name, r.room_number
    `);

    const rooms = Array.from(roomRows as Iterable<any>).map((r: any) => ({
      roomId: r.room_id as string,
      roomNumber: r.room_number as string,
      roomTypeId: r.room_type_id as string,
      roomTypeName: r.room_type_name as string,
      floor: (r.floor as string | null) ?? null,
      status: r.status as any,
      isOutOfOrder: r.is_out_of_order as boolean,
    }));

    // Query 2: Calendar segments for the day
    const segmentRows = await tx.execute(sql`
      SELECT room_id, business_date, reservation_id, status,
             guest_name, check_in_date, check_out_date,
             source_type, color_key
      FROM rm_pms_calendar_segments
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date = ${date}
      ORDER BY room_id
    `);

    const segments = Array.from(segmentRows as Iterable<any>).map((s: any) => ({
      roomId: s.room_id as string,
      businessDate: s.business_date as string,
      reservationId: s.reservation_id as string,
      status: s.status as string,
      guestName: s.guest_name as string,
      checkInDate: s.check_in_date as string,
      checkOutDate: s.check_out_date as string,
      sourceType: s.source_type as string,
      colorKey: s.color_key as string,
    }));

    // Query 3: OOO blocks covering this date
    const blockRows = await tx.execute(sql`
      SELECT room_id, start_date, end_date, reason
      FROM pms_room_blocks
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND block_type = 'MAINTENANCE'
        AND is_active = true
        AND start_date <= ${date}
        AND end_date > ${date}
    `);

    const oooBlocks = Array.from(blockRows as Iterable<any>).map((b: any) => ({
      roomId: b.room_id as string,
      startDate: b.start_date as string,
      endDate: b.end_date as string,
      reason: (b.reason as string | null) ?? null,
    }));

    // Occupancy for this date
    const occRows = await tx.execute(sql`
      SELECT rooms_occupied, rooms_available, arrivals, departures
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date = ${date}
      LIMIT 1
    `);

    const occArr = Array.from(occRows as Iterable<any>);
    const occupancy = occArr.length > 0
      ? {
          occupied: occArr[0].rooms_occupied as number,
          available: occArr[0].rooms_available as number,
          arrivals: occArr[0].arrivals as number,
          departures: occArr[0].departures as number,
        }
      : null;

    return {
      date,
      rooms,
      segments,
      oooBlocks,
      occupancy,
    };
  });
}
