import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostGetUpcomingReservationsInput } from '../validation-host';

export interface UpcomingReservationItem {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  endTime: string | null;
  mealPeriod: string | null;
  status: string;
  tags: string[];
  seatingPreference: string | null;
  occasion: string | null;
  customerId: string | null;
  tableIds: string[] | null;
  assignedTableId: string | null;
  assignedTableLabel: string | null;
  serverId: string | null;
  serverName: string | null;
  source: string;
  specialRequests: string | null;
  isVip: boolean;
  notes: string | null;
  version: number;
  createdAt: string;
  minutesUntil: number;
}

export interface UpcomingReservationsResult {
  items: UpcomingReservationItem[];
}

/**
 * Returns today's reservations that are still expected (booked, confirmed, checked_in).
 * Sorted by reservation_time ASC so the nearest reservation appears first.
 */
export async function hostGetUpcomingReservations(
  input: HostGetUpcomingReservationsInput,
): Promise<UpcomingReservationsResult> {
  const limit = input.limit ?? 20;
  const today = new Date().toISOString().slice(0, 10);

  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.guest_name,
        r.guest_phone,
        r.guest_email,
        r.party_size,
        r.reservation_date,
        r.reservation_time,
        r.end_time,
        r.meal_period,
        r.status,
        r.tags,
        r.seating_preference,
        r.occasion,
        r.customer_id,
        r.table_ids,
        r.assigned_table_id,
        t.display_label AS assigned_table_label,
        r.assigned_server_user_id,
        u.name AS server_name,
        r.source,
        r.special_requests,
        r.is_vip,
        r.notes,
        r.version,
        r.created_at,
        EXTRACT(EPOCH FROM (
          (r.reservation_date::date + r.reservation_time) - now()
        )) / 60 AS minutes_until
      FROM fnb_reservations r
      LEFT JOIN fnb_tables t ON t.id = r.assigned_table_id AND t.tenant_id = r.tenant_id
      LEFT JOIN users u ON u.id = r.assigned_server_user_id
      WHERE r.tenant_id = ${input.tenantId}
        AND r.location_id = ${input.locationId}
        AND r.reservation_date = ${today}
        AND r.status IN ('booked', 'confirmed', 'checked_in')
      ORDER BY r.reservation_time ASC
      LIMIT ${limit}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    return {
      items: allRows.map(mapUpcomingReservation),
    };
  });
}

function mapUpcomingReservation(row: Record<string, unknown>): UpcomingReservationItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    reservationDate: String(row.reservation_date),
    reservationTime: String(row.reservation_time),
    endTime: row.end_time ? String(row.end_time) : null,
    mealPeriod: row.meal_period ? String(row.meal_period) : null,
    status: String(row.status),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    tableIds: Array.isArray(row.table_ids) ? row.table_ids.map(String) : null,
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    assignedTableLabel: row.assigned_table_label ? String(row.assigned_table_label) : null,
    serverId: row.assigned_server_user_id ? String(row.assigned_server_user_id) : null,
    serverName: row.server_name ? String(row.server_name) : null,
    source: String(row.source),
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    notes: row.notes ? String(row.notes) : null,
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    minutesUntil: Math.round(Number(row.minutes_until ?? 0)),
  };
}
