import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CustomerWaitlistItem {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  businessDate: string;
  status: string;
  position: number;
  quotedWaitMinutes: number | null;
  actualWaitMinutes: number | null;
  seatingPreference: string | null;
  specialRequests: string | null;
  source: string;
  locationId: string;
  addedAt: string;
  notifiedAt: string | null;
  seatedAt: string | null;
  canceledAt: string | null;
}

export interface CustomerWaitlistListResult {
  items: CustomerWaitlistItem[];
}

export async function listWaitlistByCustomer(
  tenantId: string,
  customerId: string,
  options?: { timeframe?: 'upcoming' | 'past' | 'all'; limit?: number },
): Promise<CustomerWaitlistListResult> {
  const limit = options?.limit ?? 50;
  const timeframe = options?.timeframe ?? 'all';

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      sql`w.tenant_id = ${tenantId}`,
      sql`w.customer_id = ${customerId}`,
    ];

    if (timeframe === 'upcoming') {
      conditions.push(sql`w.status IN ('waiting', 'notified')`);
    } else if (timeframe === 'past') {
      conditions.push(sql`w.status IN ('seated', 'canceled', 'no_show', 'removed')`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        w.id,
        w.guest_name,
        w.guest_phone,
        w.party_size,
        w.business_date,
        w.status,
        w.position,
        w.quoted_wait_minutes,
        w.actual_wait_minutes,
        w.seating_preference,
        w.special_requests,
        w.source,
        w.location_id,
        w.added_at,
        w.notified_at,
        w.seated_at,
        w.canceled_at
      FROM fnb_waitlist_entries w
      WHERE ${whereClause}
      ORDER BY w.business_date DESC, w.added_at DESC
      LIMIT ${limit}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    return {
      items: allRows.map(mapRow),
    };
  });
}

function mapRow(row: Record<string, unknown>): CustomerWaitlistItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    partySize: Number(row.party_size),
    businessDate: String(row.business_date),
    status: String(row.status),
    position: Number(row.position),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    actualWaitMinutes: row.actual_wait_minutes != null ? Number(row.actual_wait_minutes) : null,
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    source: String(row.source),
    locationId: String(row.location_id),
    addedAt: String(row.added_at),
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
  };
}
