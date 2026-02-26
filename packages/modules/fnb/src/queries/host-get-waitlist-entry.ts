import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface WaitlistNotification {
  id: string;
  notificationType: string;
  channel: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  messageBody: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface HostWaitlistEntryDetail {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  actualWaitMinutes: number | null;
  status: string;
  priority: number;
  position: number;
  seatingPreference: string | null;
  specialRequests: string | null;
  isVip: boolean;
  vipNote: string | null;
  customerId: string | null;
  customerVisitCount: number;
  source: string;
  notes: string | null;
  guestToken: string | null;
  estimatedReadyAt: string | null;
  notifiedAt: string | null;
  notificationCount: number;
  lastNotificationMethod: string | null;
  confirmationStatus: string | null;
  estimatedArrivalAt: string | null;
  seatedAt: string | null;
  seatedTableId: string | null;
  seatedTableLabel: string | null;
  seatedServerUserId: string | null;
  seatedServerName: string | null;
  tabId: string | null;
  canceledAt: string | null;
  noShowAt: string | null;
  businessDate: string;
  addedAt: string;
  createdAt: string;
  updatedAt: string;
  // computed
  waitingMinutes: number;
  // notification history
  notifications: WaitlistNotification[];
}

/**
 * Returns a single waitlist entry by ID with full details and notification history
 * from fnb_guest_notifications.
 */
export async function hostGetWaitlistEntry(
  tenantId: string,
  entryId: string,
): Promise<HostWaitlistEntryDetail | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch entry and notifications in parallel
    const [entryRows, notifRows] = await Promise.all([
      tx.execute(sql`
        SELECT
          w.*,
          t.display_label AS seated_table_label,
          u.name AS seated_server_name,
          EXTRACT(EPOCH FROM (now() - w.added_at)) / 60 AS waiting_minutes
        FROM fnb_waitlist_entries w
        LEFT JOIN fnb_tables t ON t.id = w.seated_table_id AND t.tenant_id = w.tenant_id
        LEFT JOIN users u ON u.id = w.seated_server_user_id
        WHERE w.id = ${entryId}
          AND w.tenant_id = ${tenantId}
      `),
      tx.execute(sql`
        SELECT
          n.id,
          n.notification_type,
          n.channel,
          n.recipient_phone,
          n.recipient_email,
          n.message_body,
          n.status,
          n.sent_at,
          n.delivered_at,
          n.error_message,
          n.created_at
        FROM fnb_guest_notifications n
        WHERE n.tenant_id = ${tenantId}
          AND n.reference_type = 'waitlist'
          AND n.reference_id = ${entryId}
        ORDER BY n.created_at DESC
      `),
    ]);

    const allEntries = Array.from(entryRows as Iterable<Record<string, unknown>>);
    if (allEntries.length === 0) return null;

    const row = allEntries[0]!;
    const notifications = Array.from(notifRows as Iterable<Record<string, unknown>>).map(mapNotification);

    return mapWaitlistEntryDetail(row, notifications);
  });
}

function mapNotification(row: Record<string, unknown>): WaitlistNotification {
  return {
    id: String(row.id),
    notificationType: String(row.notification_type),
    channel: String(row.channel),
    recipientPhone: row.recipient_phone ? String(row.recipient_phone) : null,
    recipientEmail: row.recipient_email ? String(row.recipient_email) : null,
    messageBody: String(row.message_body),
    status: String(row.status),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
  };
}

function mapWaitlistEntryDetail(
  row: Record<string, unknown>,
  notifications: WaitlistNotification[],
): HostWaitlistEntryDetail {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    actualWaitMinutes: row.actual_wait_minutes != null ? Number(row.actual_wait_minutes) : null,
    status: String(row.status),
    priority: Number(row.priority ?? 0),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerVisitCount: Number(row.customer_visit_count ?? 0),
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    guestToken: row.guest_token ? String(row.guest_token) : null,
    estimatedReadyAt: row.estimated_ready_at ? String(row.estimated_ready_at) : null,
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    notificationCount: Number(row.notification_count ?? 0),
    lastNotificationMethod: row.last_notification_method ? String(row.last_notification_method) : null,
    confirmationStatus: row.confirmation_status ? String(row.confirmation_status) : null,
    estimatedArrivalAt: row.estimated_arrival_at ? String(row.estimated_arrival_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    seatedTableId: row.seated_table_id ? String(row.seated_table_id) : null,
    seatedTableLabel: row.seated_table_label ? String(row.seated_table_label) : null,
    seatedServerUserId: row.seated_server_user_id ? String(row.seated_server_user_id) : null,
    seatedServerName: row.seated_server_name ? String(row.seated_server_name) : null,
    tabId: row.tab_id ? String(row.tab_id) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    noShowAt: row.no_show_at ? String(row.no_show_at) : null,
    businessDate: String(row.business_date),
    addedAt: String(row.added_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    waitingMinutes: Math.round(Number(row.waiting_minutes ?? 0)),
    notifications,
  };
}
