import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CustomerReservationItem {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  endTime: string | null;
  status: string;
  seatingPreference: string | null;
  specialRequests: string | null;
  occasion: string | null;
  source: string;
  locationId: string;
  notes: string | null;
  seatedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
}

export interface CustomerReservationListResult {
  items: CustomerReservationItem[];
}

export async function listReservationsByCustomer(
  tenantId: string,
  customerId: string,
  options?: { timeframe?: 'upcoming' | 'past' | 'all'; limit?: number },
): Promise<CustomerReservationListResult> {
  const limit = options?.limit ?? 50;
  const timeframe = options?.timeframe ?? 'all';

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      sql`r.tenant_id = ${tenantId}`,
      sql`r.customer_id = ${customerId}`,
    ];

    if (timeframe === 'upcoming') {
      conditions.push(sql`r.reservation_date >= CURRENT_DATE`);
      conditions.push(sql`r.status NOT IN ('canceled', 'no_show', 'completed')`);
    } else if (timeframe === 'past') {
      conditions.push(
        sql`(r.reservation_date < CURRENT_DATE OR r.status IN ('completed', 'canceled', 'no_show'))`,
      );
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.guest_name,
        r.guest_phone,
        r.party_size,
        r.reservation_date,
        r.reservation_time,
        r.end_time,
        r.status,
        r.seating_preference,
        r.special_requests,
        r.occasion,
        r.source,
        r.location_id,
        r.notes,
        r.seated_at,
        r.canceled_at,
        r.created_at
      FROM fnb_reservations r
      WHERE ${whereClause}
      ORDER BY r.reservation_date DESC, r.reservation_time DESC
      LIMIT ${limit}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    return {
      items: allRows.map(mapRow),
    };
  });
}

function mapRow(row: Record<string, unknown>): CustomerReservationItem {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    partySize: Number(row.party_size),
    reservationDate: String(row.reservation_date),
    reservationTime: String(row.reservation_time),
    endTime: row.end_time ? String(row.end_time) : null,
    status: String(row.status),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    source: String(row.source),
    locationId: String(row.location_id),
    notes: row.notes ? String(row.notes) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    createdAt: String(row.created_at),
  };
}
