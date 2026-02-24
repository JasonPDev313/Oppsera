import { withTenant, sql } from '@oppsera/db';
import type { CalendarRoom, CalendarSegment, OooBlock, OccupancyByDate, UnassignedReservation } from './calendar-week';

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

export interface CalendarDayResponse {
  date: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  occupancy: OccupancyByDate | null;
  unassigned: UnassignedReservation[];
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

    const totalRooms = rooms.length;

    // Query 2: Segments directly from pms_reservations (bypasses read model)
    const segmentRows = await tx.execute(sql`
      SELECT
        res.room_id,
        ${date} AS business_date,
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
        res.source_type,
        res.confirmation_number,
        res.nightly_rate_cents,
        res.adults,
        res.children,
        LEFT(res.internal_notes, 80) AS internal_notes,
        res.version
      FROM pms_reservations res
      WHERE res.tenant_id = ${tenantId}
        AND res.property_id = ${propertyId}
        AND res.room_id IS NOT NULL
        AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
        AND res.check_in_date <= ${date}::date
        AND res.check_out_date > ${date}::date
      ORDER BY res.room_id
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
      confirmationNumber: s.confirmation_number ?? null,
      nightlyRateCents: Number(s.nightly_rate_cents ?? 0),
      adults: Number(s.adults ?? 1),
      children: Number(s.children ?? 0),
      internalNotes: s.internal_notes ?? null,
      version: Number(s.version ?? 1),
    }));

    // Query 3: OOO blocks covering this date
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
        AND start_date <= ${date}::date
        AND end_date > ${date}::date
    `);

    const oooBlocks = Array.from(blockRows as Iterable<any>).map((b: any) => ({
      roomId: b.room_id as string,
      startDate: toDateString(b.start_date),
      endDate: toDateString(b.end_date),
      reason: (b.reason as string | null) ?? null,
    }));

    // Query 4: Compute occupancy directly from reservations
    const occRows = await tx.execute(sql`
      SELECT
        COUNT(DISTINCT res.room_id)::int AS rooms_occupied,
        COUNT(DISTINCT CASE WHEN res.check_in_date = ${date}::date THEN res.id END)::int AS arrivals,
        COUNT(DISTINCT CASE WHEN res.check_out_date = ${date}::date THEN res.id END)::int AS departures
      FROM pms_reservations res
      WHERE res.tenant_id = ${tenantId}
        AND res.property_id = ${propertyId}
        AND res.room_id IS NOT NULL
        AND res.status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
        AND res.check_in_date <= ${date}::date
        AND res.check_out_date > ${date}::date
    `);

    const occArr = Array.from(occRows as Iterable<any>);
    const occupied = occArr.length > 0 ? Number(occArr[0].rooms_occupied ?? 0) : 0;
    const occupancy: OccupancyByDate = {
      occupied,
      available: Math.max(0, totalRooms - occupied),
      arrivals: occArr.length > 0 ? Number(occArr[0].arrivals ?? 0) : 0,
      departures: occArr.length > 0 ? Number(occArr[0].departures ?? 0) : 0,
    };

    // Query 5: Unassigned reservations overlapping this date
    const unassignedRows = await tx.execute(sql`
      SELECT
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
        rt.name AS room_type_name,
        res.source_type
      FROM pms_reservations res
      JOIN pms_room_types rt ON rt.id = res.room_type_id
      WHERE res.tenant_id = ${tenantId}
        AND res.property_id = ${propertyId}
        AND res.room_id IS NULL
        AND res.status IN ('HOLD', 'CONFIRMED')
        AND res.check_in_date <= ${date}::date
        AND res.check_out_date > ${date}::date
      ORDER BY res.check_in_date
    `);

    const unassigned: UnassignedReservation[] = Array.from(unassignedRows as Iterable<any>).map((r) => ({
      reservationId: r.reservation_id,
      status: r.status,
      guestName: r.guest_name,
      checkInDate: toDateString(r.check_in_date),
      checkOutDate: toDateString(r.check_out_date),
      roomTypeName: r.room_type_name,
      sourceType: r.source_type,
    }));

    return {
      date,
      rooms,
      segments,
      oooBlocks,
      occupancy,
      unassigned,
    };
  });
}
