import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostListWaitlistFilterInput } from '../validation-host';

export interface HostWaitlistListItem {
  id: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  quotedWaitMinutes: number | null;
  actualWaitMinutes: number | null;
  status: string;
  position: number;
  seatingPreference: string | null;
  specialRequests: string | null;
  estimatedReadyAt: string | null;
  notifiedAt: string | null;
  seatedAt: string | null;
  notificationCount: number;
  source: string;
  guestToken: string | null;
  customerId: string | null;
  addedAt: string;
  // computed
  waitingMinutes: number;
}

export interface HostWaitlistListResult {
  items: HostWaitlistListItem[];
}

/**
 * Returns active waitlist entries (status IN ('waiting', 'notified'))
 * sorted by position ASC. Includes a computed waitingMinutes field
 * representing how long each guest has been waiting.
 */
export async function hostListWaitlist(
  input: HostListWaitlistFilterInput,
): Promise<HostWaitlistListResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        w.id,
        w.guest_name,
        w.guest_phone,
        w.party_size,
        w.quoted_wait_minutes,
        w.actual_wait_minutes,
        w.status,
        w.position,
        w.seating_preference,
        w.special_requests,
        w.estimated_ready_at,
        w.notified_at,
        w.seated_at,
        w.notification_count,
        w.source,
        w.guest_token,
        w.customer_id,
        w.added_at,
        EXTRACT(EPOCH FROM (now() - w.added_at)) / 60 AS waiting_minutes
      FROM fnb_waitlist_entries w
      WHERE w.tenant_id = ${input.tenantId}
        AND w.location_id = ${input.locationId}
        AND w.status IN ('waiting', 'notified')
      ORDER BY w.position ASC
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    return {
      items: allRows.map(mapWaitlistListItem),
    };
  });
}

function mapWaitlistListItem(row: Record<string, unknown>): HostWaitlistListItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: String(row.guest_phone ?? ''),
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    actualWaitMinutes: row.actual_wait_minutes != null ? Number(row.actual_wait_minutes) : null,
    status: String(row.status),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    estimatedReadyAt: row.estimated_ready_at ? String(row.estimated_ready_at) : null,
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    notificationCount: Number(row.notification_count ?? 0),
    source: String(row.source),
    guestToken: row.guest_token ? String(row.guest_token) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    addedAt: String(row.added_at),
    waitingMinutes: Math.round(Number(row.waiting_minutes ?? 0)),
  };
}
