import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GuestSearchItem {
  id: string;
  propertyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isVip: boolean;
  totalStays: number;
  lastStayDate: string | null;
  createdAt: string;
}

interface SearchGuestsInput {
  tenantId: string;
  propertyId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchGuestsResult {
  items: GuestSearchItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Searches guests by name (ILIKE), email (exact), and/or phone (exact).
 * Returns stay count from the denormalized totalStays column.
 *
 * At least one search criterion should be provided, but this is enforced
 * at the API/validation layer, not here.
 */
export async function searchGuests(input: SearchGuestsInput): Promise<SearchGuestsResult> {
  const limit = Math.min(input.limit ?? 25, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`g.tenant_id = ${input.tenantId}`,
      sql`g.property_id = ${input.propertyId}`,
    ];

    if (input.firstName) {
      conditions.push(sql`g.first_name ILIKE ${'%' + input.firstName + '%'}`);
    }
    if (input.lastName) {
      conditions.push(sql`g.last_name ILIKE ${'%' + input.lastName + '%'}`);
    }
    if (input.email) {
      conditions.push(sql`g.email = ${input.email}`);
    }
    if (input.phone) {
      conditions.push(sql`g.phone = ${input.phone}`);
    }
    if (input.cursor) {
      conditions.push(sql`g.id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        g.id,
        g.property_id,
        g.first_name,
        g.last_name,
        g.email,
        g.phone,
        g.is_vip,
        g.total_stays,
        g.last_stay_date,
        g.created_at
      FROM pms_guests g
      WHERE ${whereClause}
      ORDER BY g.last_name ASC, g.first_name ASC, g.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        propertyId: String(r.property_id),
        firstName: String(r.first_name),
        lastName: String(r.last_name),
        email: r.email ? String(r.email) : null,
        phone: r.phone ? String(r.phone) : null,
        isVip: Boolean(r.is_vip),
        totalStays: Number(r.total_stays),
        lastStayDate: r.last_stay_date ? String(r.last_stay_date) : null,
        createdAt: String(r.created_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
