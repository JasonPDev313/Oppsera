import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { AppError } from '@oppsera/shared';

// ── Reservation Fetch ───────────────────────────────────────────

export async function fetchHostReservation(
  tx: any,
  tenantId: string,
  reservationId: string,
) {
  const rows = await tx.execute(sql`
    SELECT * FROM fnb_reservations
    WHERE id = ${reservationId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `);
  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) throw new AppError('NOT_FOUND', `Reservation ${reservationId} not found`, 404);
  return row;
}

// ── Waitlist Entry Fetch ────────────────────────────────────────

export async function fetchHostWaitlistEntry(
  tx: any,
  tenantId: string,
  entryId: string,
) {
  const rows = await tx.execute(sql`
    SELECT * FROM fnb_waitlist_entries
    WHERE id = ${entryId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `);
  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) throw new AppError('NOT_FOUND', `Waitlist entry ${entryId} not found`, 404);
  return row;
}

// ── Row Mappers ─────────────────────────────────────────────────

export function mapHostReservationRow(row: Record<string, unknown>) {
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
    mealPeriod: row.meal_period ? String(row.meal_period) : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    tableIds: Array.isArray(row.table_ids) ? row.table_ids.map(String) : null,
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    serverId: row.assigned_server_user_id ? String(row.assigned_server_user_id) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    version: Number(row.version ?? 1),
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    canceledBy: row.canceled_by ? String(row.canceled_by) : null,
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    noShowAt: row.no_show_at ? String(row.no_show_at) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export function mapHostWaitlistRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    status: String(row.status),
    priority: Number(row.priority ?? 0),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    source: String(row.source ?? 'host'),
    notes: row.notes ? String(row.notes) : null,
    guestToken: row.guest_token ? String(row.guest_token) : null,
    estimatedReadyAt: row.estimated_ready_at ? String(row.estimated_ready_at) : null,
    addedAt: String(row.added_at ?? row.created_at),
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    notificationCount: Number(row.notification_count ?? 0),
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    seatedTableId: row.seated_table_id ? String(row.seated_table_id) : null,
    actualWaitMinutes: row.actual_wait_minutes != null ? Number(row.actual_wait_minutes) : null,
    businessDate: String(row.business_date),
  };
}

// ── Guest Token Generator ───────────────────────────────────────

export function generateGuestToken(): string {
  return randomBytes(6).toString('base64url').slice(0, 8);
}
