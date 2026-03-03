import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { mapGuestProfile } from '../queries/get-guest-profile';
import type { GuestProfileResult } from '../queries/get-guest-profile';

export interface UpdateGuestNotesInput {
  id: string;
  notes?: string;
  tags?: string[];
}

/**
 * Update the notes and/or tags fields on a guest profile.
 *
 * Only the fields explicitly provided are updated — absent fields are left unchanged.
 * Returns the full updated profile on success, or null if the profile is not found
 * within this tenant.
 */
export async function updateGuestNotes(
  ctx: RequestContext,
  input: UpdateGuestNotesInput,
): Promise<GuestProfileResult | null> {
  const { tenantId } = ctx;
  const { id, notes, tags } = input;

  return withTenant(tenantId, async (tx) => {
    // Verify profile belongs to this tenant
    const existingRows = await tx.execute(sql`
      SELECT id FROM fnb_guest_profiles
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const existing = Array.from(existingRows as Iterable<Record<string, unknown>>)[0];
    if (!existing) return null;

    // Build partial update — only update fields that were provided
    const updates: ReturnType<typeof sql>[] = [];
    if (notes !== undefined) updates.push(sql`notes = ${notes}`);
    if (tags !== undefined) updates.push(sql`tags = ${JSON.stringify(tags)}::jsonb`);
    updates.push(sql`updated_at = NOW()`);

    await tx.execute(sql`
      UPDATE fnb_guest_profiles
      SET ${sql.join(updates, sql`, `)}
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `);

    // Return updated row
    const updatedRows = await tx.execute(sql`
      SELECT
        id, tenant_id, location_id, customer_id,
        guest_phone, guest_email, guest_name,
        visit_count, no_show_count, cancel_count,
        avg_ticket_cents, total_spend_cents,
        last_visit_date, first_visit_date,
        preferred_tables, preferred_server,
        seating_preference, frequent_items, tags, notes,
        last_computed_at, created_at, updated_at
      FROM fnb_guest_profiles
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const row = Array.from(updatedRows as Iterable<Record<string, unknown>>)[0];
    if (!row) return null;

    return mapGuestProfile(row);
  });
}
