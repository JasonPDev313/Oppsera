import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetWaitlistFilterInput } from '../validation';

export interface WaitlistItem {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  status: string;
  priority: number;
  position: number;
  seatingPreference: string | null;
  specialRequests: string | null;
  isVip: boolean;
  vipNote: string | null;
  customerId: string | null;
  addedAt: string;
  notifiedAt: string | null;
  seatedAt: string | null;
  actualWaitMinutes: number | null;
  assignedTableId: string | null;
  assignedTableLabel: string | null;
  source: string;
  notes: string | null;
  elapsedMinutes: number;
}

export interface WaitlistResult {
  items: WaitlistItem[];
  totalCount: number;
}

export async function getWaitlist(
  input: GetWaitlistFilterInput,
): Promise<WaitlistResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`w.tenant_id = ${input.tenantId}`,
      sql`w.location_id = ${input.locationId}`,
      sql`w.business_date = ${input.businessDate}`,
    ];

    if (input.status) {
      conditions.push(sql`w.status = ${input.status}`);
    }
    if (input.statuses && input.statuses.length > 0) {
      conditions.push(sql`w.status = ANY(${input.statuses})`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const [rows, countRows] = await Promise.all([
      tx.execute(sql`
        SELECT w.*,
          t.display_label AS assigned_table_label,
          EXTRACT(EPOCH FROM (now() - w.added_at)) / 60 AS elapsed_minutes
        FROM fnb_waitlist_entries w
        LEFT JOIN fnb_tables t ON t.id = w.assigned_table_id AND t.tenant_id = w.tenant_id
        WHERE ${whereClause}
        ORDER BY w.priority DESC, w.position ASC
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM fnb_waitlist_entries w
        WHERE ${whereClause}
      `),
    ]);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map(mapWaitlistItem);
    const total = Number((Array.from(countRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.total ?? 0);

    return { items, totalCount: total };
  });
}

function mapWaitlistItem(row: Record<string, unknown>): WaitlistItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    status: String(row.status),
    priority: Number(row.priority),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    addedAt: String(row.added_at),
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    actualWaitMinutes: row.actual_wait_minutes != null ? Number(row.actual_wait_minutes) : null,
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    assignedTableLabel: row.assigned_table_label ? String(row.assigned_table_label) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    elapsedMinutes: Math.round(Number(row.elapsed_minutes ?? 0)),
  };
}
