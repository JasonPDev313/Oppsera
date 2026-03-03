import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  computeReliabilityScore,
  deriveGuestSegment,
} from '../services/guest-profile-aggregator';

export interface GetGuestProfileInput {
  tenantId: string;
  locationId: string;
  customerId?: string;
  guestPhone?: string;
  guestEmail?: string;
}

export interface GuestProfileResult {
  id: string;
  tenantId: string;
  locationId: string;
  customerId: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  guestName: string | null;
  visitCount: number;
  noShowCount: number;
  cancelCount: number;
  avgTicketCents: number | null;
  totalSpendCents: number;
  lastVisitDate: string | null;
  firstVisitDate: string | null;
  preferredTables: string | null;
  preferredServer: string | null;
  seatingPreference: string | null;
  frequentItems: unknown;
  tags: unknown;
  notes: string | null;
  reliabilityScore: number;
  segment: string;
  lastComputedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch a single guest profile by any available identifier.
 * Lookup priority: customerId → phone → email.
 * Enriches the result with computed reliabilityScore and segment.
 *
 * Returns null when no profile is found.
 */
export async function getGuestProfile(
  input: GetGuestProfileInput,
): Promise<GuestProfileResult | null> {
  const { tenantId, customerId, guestPhone, guestEmail } = input;

  if (!customerId && !guestPhone && !guestEmail) return null;

  return withTenant(tenantId, async (tx) => {
    // Build OR filter for the identifiers provided
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${tenantId}`,
    ];

    const orParts: ReturnType<typeof sql>[] = [];
    if (customerId) orParts.push(sql`customer_id = ${customerId}`);
    if (guestPhone) orParts.push(sql`guest_phone = ${guestPhone}`);
    if (guestEmail) orParts.push(sql`guest_email = ${guestEmail}`);

    const orClause = sql.join(orParts, sql` OR `);
    conditions.push(sql`(${orClause})`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        id,
        tenant_id,
        location_id,
        customer_id,
        guest_phone,
        guest_email,
        guest_name,
        visit_count,
        no_show_count,
        cancel_count,
        avg_ticket_cents,
        total_spend_cents,
        last_visit_date,
        first_visit_date,
        preferred_tables,
        preferred_server,
        seating_preference,
        frequent_items,
        tags,
        notes,
        last_computed_at,
        created_at,
        updated_at
      FROM fnb_guest_profiles
      WHERE ${whereClause}
      ORDER BY last_computed_at DESC
      LIMIT 1
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!row) return null;

    return mapGuestProfile(row);
  });
}

export function mapGuestProfile(row: Record<string, unknown>): GuestProfileResult {
  const visitCount = Number(row.visit_count ?? 0);
  const noShowCount = Number(row.no_show_count ?? 0);
  const cancelCount = Number(row.cancel_count ?? 0);
  const totalSpendCents = Number(row.total_spend_cents ?? 0);

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    guestName: row.guest_name ? String(row.guest_name) : null,
    visitCount,
    noShowCount,
    cancelCount,
    avgTicketCents: row.avg_ticket_cents != null ? Number(row.avg_ticket_cents) : null,
    totalSpendCents,
    lastVisitDate: row.last_visit_date ? String(row.last_visit_date) : null,
    firstVisitDate: row.first_visit_date ? String(row.first_visit_date) : null,
    preferredTables: row.preferred_tables ? String(row.preferred_tables) : null,
    preferredServer: row.preferred_server ? String(row.preferred_server) : null,
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    frequentItems: row.frequent_items ?? [],
    tags: row.tags ?? [],
    notes: row.notes ? String(row.notes) : null,
    reliabilityScore: computeReliabilityScore(visitCount, noShowCount, cancelCount),
    segment: deriveGuestSegment(visitCount, totalSpendCents),
    lastComputedAt: String(row.last_computed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
