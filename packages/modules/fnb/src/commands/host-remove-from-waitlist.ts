import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { HostRemoveFromWaitlistInput } from '../validation-host';
import { fetchHostWaitlistEntry } from './host-helpers';

/**
 * HOST V2: Remove a party from the waitlist.
 * Supports three removal reasons: canceled, left, no_show.
 * Recalculates positions for remaining active entries.
 */
export async function hostRemoveFromWaitlist(
  ctx: RequestContext,
  entryId: string,
  input: HostRemoveFromWaitlistInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to remove from waitlist');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostWaitlistEntry(tx, ctx.tenantId, entryId);
    const oldStatus = String(existing.status);

    // Validate the entry is still active
    if (oldStatus !== 'waiting' && oldStatus !== 'notified') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot remove waitlist entry with status '${oldStatus}'`,
        409,
      );
    }

    const reason = input.reason ?? 'canceled';

    // Calculate actual wait time
    const now = new Date();
    const addedAt = new Date(String(existing.added_at ?? existing.created_at));
    const actualWaitMinutes = Math.round((now.getTime() - addedAt.getTime()) / 60_000);

    // Update entry with the removal reason
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = ${reason},
          actual_wait_minutes = ${actualWaitMinutes},
          updated_at = now()
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
    `);

    // Recalculate positions: decrement all entries after the removed one
    const removedPosition = Number(existing.position);
    const businessDate = String(existing.business_date);

    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET position = position - 1
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
        AND business_date = ${businessDate}
        AND status IN ('waiting', 'notified')
        AND position > ${removedPosition}
    `);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.removed.v1', {
      waitlistEntryId: entryId,
      guestName: String(existing.guest_name),
      partySize: Number(existing.party_size),
      reason,
      actualWaitMinutes,
      removedFromPosition: removedPosition,
    });

    return {
      result: {
        id: entryId,
        guestName: String(existing.guest_name),
        partySize: Number(existing.party_size),
        status: reason,
        actualWaitMinutes,
      },
      events: [event],
    };
  });

  await auditLog(ctx, `fnb.waitlist.${input.reason ?? 'canceled'}`, 'waitlist_entry', entryId);
  return result;
}
