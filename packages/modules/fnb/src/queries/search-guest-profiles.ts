import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { mapGuestProfile } from './get-guest-profile';
import type { GuestProfileResult } from './get-guest-profile';

export interface SearchGuestProfilesInput {
  tenantId: string;
  locationId: string;
  search: string;     // ILIKE across name, phone, email
  limit?: number;     // default 20, max 100
}

/**
 * Search guest profiles by ILIKE match on guest_name, guest_phone, or guest_email.
 * Returns paginated list ordered by visit_count DESC (most frequent guests first).
 */
export async function searchGuestProfiles(
  input: SearchGuestProfilesInput,
): Promise<GuestProfileResult[]> {
  const { tenantId, search } = input;
  const limit = Math.min(input.limit ?? 20, 100);
  const searchPattern = `%${search}%`;

  return withTenant(tenantId, async (tx) => {
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
      WHERE tenant_id = ${tenantId}
        AND (
          guest_name  ILIKE ${searchPattern}
          OR guest_phone ILIKE ${searchPattern}
          OR guest_email ILIKE ${searchPattern}
        )
      ORDER BY visit_count DESC, last_visit_date DESC NULLS LAST
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map(mapGuestProfile);
  });
}
