import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HostReservationDetail {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
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
  externalBookingId: string | null;
  channel: string | null;
  notes: string | null;
  specialRequests: string | null;
  isVip: boolean;
  vipNote: string | null;
  depositAmountCents: number | null;
  depositStatus: string | null;
  version: number;
  checkedInAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  confirmedAt: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  reminderCount: number;
  canceledAt: string | null;
  canceledBy: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  tabId: string | null;
  waitlistEntryId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export async function hostGetReservation(
  tenantId: string,
  reservationId: string,
): Promise<HostReservationDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.guest_name,
        r.guest_phone,
        r.guest_email,
        r.party_size,
        r.reservation_date,
        r.reservation_time,
        r.duration_minutes,
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
        r.external_booking_id,
        r.channel,
        r.notes,
        r.special_requests,
        r.is_vip,
        r.vip_note,
        r.deposit_amount_cents,
        r.deposit_status,
        r.version,
        r.checked_in_at,
        r.seated_at,
        r.completed_at,
        r.confirmed_at,
        r.confirmation_sent_at,
        r.reminder_sent_at,
        r.reminder_count,
        r.canceled_at,
        r.canceled_by,
        r.cancel_reason,
        r.no_show_at,
        r.tab_id,
        r.waitlist_entry_id,
        r.created_at,
        r.created_by,
        r.updated_at
      FROM fnb_reservations r
      LEFT JOIN fnb_tables t ON t.id = r.assigned_table_id AND t.tenant_id = r.tenant_id
      LEFT JOIN users u ON u.id = r.assigned_server_user_id
      WHERE r.id = ${reservationId}
        AND r.tenant_id = ${tenantId}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    if (allRows.length === 0) return null;

    return mapReservationDetail(allRows[0]!);
  });
}

function mapReservationDetail(row: Record<string, unknown>): HostReservationDetail {
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
    externalBookingId: row.external_booking_id ? String(row.external_booking_id) : null,
    channel: row.channel ? String(row.channel) : null,
    notes: row.notes ? String(row.notes) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    depositAmountCents: row.deposit_amount_cents != null ? Number(row.deposit_amount_cents) : null,
    depositStatus: row.deposit_status ? String(row.deposit_status) : null,
    version: Number(row.version ?? 1),
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    confirmationSentAt: row.confirmation_sent_at ? String(row.confirmation_sent_at) : null,
    reminderSentAt: row.reminder_sent_at ? String(row.reminder_sent_at) : null,
    reminderCount: Number(row.reminder_count ?? 0),
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    canceledBy: row.canceled_by ? String(row.canceled_by) : null,
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    noShowAt: row.no_show_at ? String(row.no_show_at) : null,
    tabId: row.tab_id ? String(row.tab_id) : null,
    waitlistEntryId: row.waitlist_entry_id ? String(row.waitlist_entry_id) : null,
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedAt: String(row.updated_at),
  };
}
