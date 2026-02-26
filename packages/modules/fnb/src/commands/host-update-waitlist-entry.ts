import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { HostUpdateWaitlistEntryInput } from '../validation-host';
import { mapHostWaitlistRow } from './host-helpers';

/**
 * HOST V2: Update a waitlist entry (minor patch, no event emitted).
 * Only active entries (waiting/notified) can be updated.
 */
export async function hostUpdateWaitlistEntry(
  ctx: RequestContext,
  entryId: string,
  input: HostUpdateWaitlistEntryInput,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    // Fetch entry and validate it's still active
    const fetchRows = await tx.execute(sql`
      SELECT * FROM fnb_waitlist_entries
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);
    const existing = Array.from(fetchRows as Iterable<Record<string, unknown>>)[0];
    if (!existing) throw new AppError('NOT_FOUND', `Waitlist entry ${entryId} not found`, 404);

    const status = String(existing.status);
    if (status !== 'waiting' && status !== 'notified') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot update waitlist entry with status '${status}'`,
        409,
      );
    }

    // Build SET clause dynamically from provided fields
    const setClauses: ReturnType<typeof sql>[] = [];

    if (input.guestName !== undefined) {
      setClauses.push(sql`guest_name = ${input.guestName}`);
    }
    if (input.guestPhone !== undefined) {
      setClauses.push(sql`guest_phone = ${input.guestPhone}`);
    }
    if (input.partySize !== undefined) {
      setClauses.push(sql`party_size = ${input.partySize}`);
    }
    if (input.seatingPreference !== undefined) {
      setClauses.push(sql`seating_preference = ${input.seatingPreference}`);
    }
    if (input.specialRequests !== undefined) {
      setClauses.push(sql`special_requests = ${input.specialRequests}`);
    }
    if (input.notes !== undefined) {
      setClauses.push(sql`notes = ${input.notes}`);
    }

    if (setClauses.length === 0) {
      // Nothing to update — return existing data
      return mapHostWaitlistRow(existing);
    }

    // Always update timestamp
    setClauses.push(sql`updated_at = now()`);

    const setExpression = sql.join(setClauses, sql`, `);

    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET ${setExpression}
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return mapHostWaitlistRow(updated);
  });
}
