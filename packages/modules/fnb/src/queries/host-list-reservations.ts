import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostListReservationsFilterInput } from '../validation-host';

export interface HostReservationListItem {
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
  serverId: string | null;
  source: string;
  notes: string | null;
  specialRequests: string | null;
  version: number;
  checkedInAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface HostReservationListResult {
  items: HostReservationListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function hostListReservations(
  input: HostListReservationsFilterInput,
): Promise<HostReservationListResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`r.tenant_id = ${input.tenantId}`,
      sql`r.location_id = ${input.locationId}`,
      sql`r.reservation_date = ${input.date}`,
    ];

    if (input.mealPeriod) {
      conditions.push(sql`r.meal_period = ${input.mealPeriod}`);
    }
    if (input.status) {
      conditions.push(sql`r.status = ${input.status}`);
    }
    if (input.search) {
      conditions.push(sql`r.guest_name ILIKE ${'%' + input.search + '%'}`);
    }
    if (input.cursor) {
      conditions.push(sql`r.id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

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
        r.assigned_server_user_id,
        r.source,
        r.notes,
        r.special_requests,
        r.version,
        r.checked_in_at,
        r.seated_at,
        r.completed_at,
        r.created_at
      FROM fnb_reservations r
      WHERE ${whereClause}
      ORDER BY r.reservation_time ASC, r.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    return {
      items: items.map(mapReservationListItem),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}

function mapReservationListItem(row: Record<string, unknown>): HostReservationListItem {
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
    serverId: row.assigned_server_user_id ? String(row.assigned_server_user_id) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    version: Number(row.version ?? 1),
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
  };
}
