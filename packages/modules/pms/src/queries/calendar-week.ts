import { withTenant, sql } from '@oppsera/db';
import type { RoomStatus } from '../types';

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

function computeColorKey(status: string): string {
  switch (status) {
    case 'HOLD':
      return 'hold';
    case 'CONFIRMED':
      return 'confirmed';
    case 'CHECKED_IN':
      return 'in-house';
    default:
      return 'unknown';
  }
}

/**
 * Convert a value that may be a Date object or string to a YYYY-MM-DD string.
 * postgres.js may return DATE columns as strings or Date objects depending on config.
 */
function toDateString(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]!;
  }
  return String(val ?? '');
}

export async function getCalendarWeek(
  tenantId: string,
  propertyId: string,
  startDate: string,
): Promise<CalendarWeekResponse> {
  // Calculate end date = start + 7
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
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

    const totalRooms = rooms.length;

    // Query 2: Build calendar segments directly from pms_reservations using generate_series.
    // This bypasses the read model (rm_pms_calendar_segments) which depends on event
    // consumers running successfully. At this scale, the direct query is fast enough.
    const segmentRows = await tx.execute(sql`
      SELECT
        res.room_id,
        to_char(d.d, 'YYYY-MM-DD') AS business_date,
        res.id AS reservation_id,
        res.status,
        COALESCE(
          NULLIF(
            concat_ws(
              ' ',
              (res.primary_guest_json::jsonb ->> 'firstName'),
              (res.primary_guest_json::jsonb ->> 'lastName')
            ),
            ''
          ),
          'Guest'
        ) AS guest_name,
        to_char(res.check_in_date, 'YYYY-MM-DD') AS check_in_date,
        to_char(res.check_out_date, 'YYYY-MM-DD') AS check_out_date,
        res.source_type
      FROM pms_reservations res
      CROSS JOIN LATERAL generate_series(
        GREATEST(res.check_in_date, ${startDate}::date),
        LEAST(res.check_out_date, ${endDate}::date) - interval '1 day',
        '1 day'
      ) AS d(d)
      WHERE res.tenant_id = ${tenantId}
        AND res.property_id = ${propertyId}
        AND res.room_id IS NOT NULL
        AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
        AND res.check_in_date < ${endDate}::date
        AND res.check_out_date > ${startDate}::date
      ORDER BY res.room_id, d.d
    `);

    const segments: CalendarSegment[] = Array.from(segmentRows as Iterable<any>).map((s) => ({
      roomId: s.room_id,
      businessDate: toDateString(s.business_date),
      reservationId: s.reservation_id,
      status: s.status,
      guestName: s.guest_name,
      checkInDate: toDateString(s.check_in_date),
      checkOutDate: toDateString(s.check_out_date),
      sourceType: s.source_type,
      colorKey: computeColorKey(s.status),
    }));

    // Query 3: OOO blocks for date range
    const blockRows = await tx.execute(sql`
      SELECT room_id,
             to_char(start_date, 'YYYY-MM-DD') AS start_date,
             to_char(end_date, 'YYYY-MM-DD') AS end_date,
             reason
      FROM pms_room_blocks
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND block_type = 'MAINTENANCE'
        AND is_active = true
        AND start_date < ${endDate}::date
        AND end_date > ${startDate}::date
    `);

    const oooBlocks: OooBlock[] = Array.from(blockRows as Iterable<any>).map((b) => ({
      roomId: b.room_id,
      startDate: toDateString(b.start_date),
      endDate: toDateString(b.end_date),
      reason: b.reason ?? null,
    }));

    // Query 4: Compute occupancy per date directly from reservations
    const occRows = await tx.execute(sql`
      SELECT
        to_char(d.d, 'YYYY-MM-DD') AS business_date,
        COUNT(DISTINCT res.room_id)::int AS rooms_occupied,
        COUNT(DISTINCT CASE WHEN res.check_in_date = d.d THEN res.id END)::int AS arrivals,
        COUNT(DISTINCT CASE WHEN res.check_out_date = d.d THEN res.id END)::int AS departures
      FROM generate_series(${startDate}::date, ${endDate}::date - interval '1 day', '1 day') AS d(d)
      LEFT JOIN pms_reservations res
        ON res.tenant_id = ${tenantId}
        AND res.property_id = ${propertyId}
        AND res.room_id IS NOT NULL
        AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
        AND res.check_in_date <= d.d
        AND res.check_out_date > d.d
      GROUP BY d.d
      ORDER BY d.d
    `);

    const occupancyByDate: Record<string, OccupancyByDate> = {};
    for (const row of Array.from(occRows as Iterable<any>)) {
      const dateKey = toDateString(row.business_date);
      const occupied = Number(row.rooms_occupied ?? 0);
      occupancyByDate[dateKey] = {
        occupied,
        available: Math.max(0, totalRooms - occupied),
        arrivals: Number(row.arrivals ?? 0),
        departures: Number(row.departures ?? 0),
      };
    }

    return {
      startDate,
      endDate,
      rooms,
      segments,
      oooBlocks,
      meta: {
        totalRooms,
        occupancyByDate,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  });
}
