import { withTenant, sql, pmsRooms, pmsRoomTypes, rmPmsCalendarSegments, pmsRoomBlocks, rmPmsDailyOccupancy } from '@oppsera/db';
import type { RoomStatus, ReservationStatus } from '../types';

export interface CalendarRoom {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  status: RoomStatus;
  isOutOfOrder: boolean;
}

export interface CalendarSegment {
  roomId: string;
  businessDate: string;
  reservationId: string;
  status: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  sourceType: string;
  colorKey: string;
}

export interface OooBlock {
  roomId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface OccupancyByDate {
  occupied: number;
  available: number;
  arrivals: number;
  departures: number;
}

export interface CalendarWeekResponse {
  startDate: string;
  endDate: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  meta: {
    totalRooms: number;
    occupancyByDate: Record<string, OccupancyByDate>;
    lastUpdatedAt: string;
  };
}

export async function getCalendarWeek(
  tenantId: string,
  propertyId: string,
  startDate: string,
): Promise<CalendarWeekResponse> {
  // Calculate end date = start + 7
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const endDate = end.toISOString().split('T')[0]!;

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

    const rooms: CalendarRoom[] = Array.from(roomRows as Iterable<any>).map((r) => ({
      roomId: r.room_id,
      roomNumber: r.room_number,
      roomTypeId: r.room_type_id,
      roomTypeName: r.room_type_name,
      floor: r.floor ?? null,
      status: r.status as RoomStatus,
      isOutOfOrder: r.is_out_of_order,
    }));

    // Query 2: Calendar segments for date range
    const segmentRows = await tx.execute(sql`
      SELECT room_id, business_date, reservation_id, status,
             guest_name, check_in_date, check_out_date,
             source_type, color_key
      FROM rm_pms_calendar_segments
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date >= ${startDate}
        AND business_date < ${endDate}
      ORDER BY room_id, business_date
    `);

    const segments: CalendarSegment[] = Array.from(segmentRows as Iterable<any>).map((s) => ({
      roomId: s.room_id,
      businessDate: s.business_date,
      reservationId: s.reservation_id,
      status: s.status,
      guestName: s.guest_name,
      checkInDate: s.check_in_date,
      checkOutDate: s.check_out_date,
      sourceType: s.source_type,
      colorKey: s.color_key,
    }));

    // Query 3: OOO blocks for date range
    const blockRows = await tx.execute(sql`
      SELECT room_id, start_date, end_date, reason
      FROM pms_room_blocks
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND block_type = 'MAINTENANCE'
        AND is_active = true
        AND start_date < ${endDate}
        AND end_date > ${startDate}
    `);

    const oooBlocks: OooBlock[] = Array.from(blockRows as Iterable<any>).map((b) => ({
      roomId: b.room_id,
      startDate: b.start_date,
      endDate: b.end_date,
      reason: b.reason ?? null,
    }));

    // Build occupancy by date from read model
    const occRows = await tx.execute(sql`
      SELECT business_date, rooms_occupied, rooms_available, arrivals, departures
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date >= ${startDate}
        AND business_date < ${endDate}
      ORDER BY business_date
    `);

    const occupancyByDate: Record<string, OccupancyByDate> = {};
    for (const row of Array.from(occRows as Iterable<any>)) {
      occupancyByDate[row.business_date] = {
        occupied: row.rooms_occupied,
        available: row.rooms_available,
        arrivals: row.arrivals,
        departures: row.departures,
      };
    }

    return {
      startDate,
      endDate,
      rooms,
      segments,
      oooBlocks,
      meta: {
        totalRooms: rooms.length,
        occupancyByDate,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  });
}
