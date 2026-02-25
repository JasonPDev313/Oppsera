import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetReservationsFilterInput } from '../validation';

export interface ReservationItem {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  endTime: string | null;
  status: string;
  seatingPreference: string | null;
  specialRequests: string | null;
  occasion: string | null;
  isVip: boolean;
  vipNote: string | null;
  customerId: string | null;
  assignedTableId: string | null;
  assignedTableLabel: string | null;
  assignedServerUserId: string | null;
  assignedServerName: string | null;
  seatedAt: string | null;
  tabId: string | null;
  confirmedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  minutesUntil: number;
}

export interface ReservationsResult {
  items: ReservationItem[];
  totalCount: number;
}

export async function getReservations(
  input: GetReservationsFilterInput,
): Promise<ReservationsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`r.tenant_id = ${input.tenantId}`,
      sql`r.location_id = ${input.locationId}`,
    ];

    if (input.reservationDate) {
      conditions.push(sql`r.reservation_date = ${input.reservationDate}`);
    }
    if (input.status) {
      conditions.push(sql`r.status = ${input.status}`);
    }
    if (input.statuses && input.statuses.length > 0) {
      conditions.push(sql`r.status = ANY(${input.statuses})`);
    }
    if (input.startDate && input.endDate) {
      conditions.push(sql`r.reservation_date >= ${input.startDate}`);
      conditions.push(sql`r.reservation_date <= ${input.endDate}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const [rows, countRows] = await Promise.all([
      tx.execute(sql`
        SELECT r.*,
          t.display_label AS assigned_table_label,
          u.name AS assigned_server_name,
          EXTRACT(EPOCH FROM (
            (r.reservation_date::date + r.reservation_time) - now()
          )) / 60 AS minutes_until
        FROM fnb_reservations r
        LEFT JOIN fnb_tables t ON t.id = r.assigned_table_id AND t.tenant_id = r.tenant_id
        LEFT JOIN users u ON u.id = r.assigned_server_user_id
        WHERE ${whereClause}
        ORDER BY r.reservation_date ASC, r.reservation_time ASC
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM fnb_reservations r
        WHERE ${whereClause}
      `),
    ]);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map(mapReservationItem);
    const total = Number((Array.from(countRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.total ?? 0);

    return { items, totalCount: total };
  });
}

function mapReservationItem(row: Record<string, unknown>): ReservationItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    reservationDate: String(row.reservation_date),
    reservationTime: String(row.reservation_time),
    durationMinutes: Number(row.duration_minutes),
    endTime: row.end_time ? String(row.end_time) : null,
    status: String(row.status),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    assignedTableLabel: row.assigned_table_label ? String(row.assigned_table_label) : null,
    assignedServerUserId: row.assigned_server_user_id ? String(row.assigned_server_user_id) : null,
    assignedServerName: row.assigned_server_name ? String(row.assigned_server_name) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    tabId: row.tab_id ? String(row.tab_id) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    noShowAt: row.no_show_at ? String(row.no_show_at) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    minutesUntil: Math.round(Number(row.minutes_until ?? 0)),
  };
}
