// ── Command: decline-table-offer ─────────────────────────────────────────
// A waitlist party declines the offered table.
// Clears the offer fields and increments offer_declined_count.
// The promoter will cascade to the next eligible party on the next
// fnb.table.status_changed.v1 → available event (or a scheduled sweep).
//
// Emits: fnb.waitlist.offer_declined.v1

import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { HOST_EVENTS } from '../events/host-events';
import { mapHostWaitlistRow } from './host-helpers';

// ── Types ─────────────────────────────────────────────────────────────────

export interface DeclineTableOfferInput {
  waitlistEntryId: string;
  clientRequestId?: string;
}

// ── Command ───────────────────────────────────────────────────────────────

/**
 * Decline a pending table offer for a waitlist entry.
 *
 * Validations:
 *  1. Waitlist entry exists and has an active offer (offeredTableId is non-null)
 *  2. Status must be 'waiting' or 'notified'
 *
 * Side effects:
 *  - Clears offered_table_id / offered_at / offer_expires_at
 *  - Increments offer_declined_count
 *
 * The freed table will be re-offered via the next table-available event or
 * a scheduled expiry sweep.
 */
export async function declineTableOffer(
  ctx: RequestContext,
  input: DeclineTableOfferInput,
): Promise<Record<string, unknown>> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to decline a table offer');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {

    // ── Idempotency ──────────────────────────────────────────────────────
    const idempotency = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'declineTableOffer',
    );
    if (idempotency.isDuplicate) {
      return { result: idempotency.originalResult as Record<string, unknown>, events: [] };
    }

    // ── 1. Lock + validate waitlist entry ────────────────────────────────
    const entryRows = await tx.execute(sql`
      SELECT *
      FROM fnb_waitlist_entries
      WHERE id          = ${input.waitlistEntryId}
        AND tenant_id   = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
      FOR UPDATE
    `);
    const entryArr = Array.from(entryRows as Iterable<Record<string, unknown>>);
    if (entryArr.length === 0) {
      throw new AppError('NOT_FOUND', `Waitlist entry ${input.waitlistEntryId} not found`, 404);
    }
    const entry = entryArr[0]!;
    const entryStatus = String(entry.status);

    if (entryStatus !== 'waiting' && entryStatus !== 'notified') {
      throw new AppError(
        'INVALID_STATUS',
        `Waitlist entry is '${entryStatus}'; only 'waiting' or 'notified' entries can decline an offer`,
        409,
      );
    }

    if (!entry.offered_table_id) {
      throw new AppError(
        'NO_OFFER',
        `Waitlist entry ${input.waitlistEntryId} has no pending table offer to decline`,
        409,
      );
    }

    const declinedTableId = String(entry.offered_table_id);

    // ── 2. Clear offer + increment decline count ──────────────────────────
    const updatedRows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET
        offered_table_id      = NULL,
        offered_at            = NULL,
        offer_expires_at      = NULL,
        offer_declined_count  = offer_declined_count + 1,
        updated_at            = now()
      WHERE id        = ${input.waitlistEntryId}
        AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);
    const updated = Array.from(updatedRows as Iterable<Record<string, unknown>>)[0]!;

    // ── 3. Build event ────────────────────────────────────────────────────
    const event = buildEventFromContext(ctx, HOST_EVENTS.WAITLIST_OFFER_DECLINED, {
      waitlistEntryId: input.waitlistEntryId,
      declinedTableId,
      guestName: String(entry.guest_name),
      partySize: Number(entry.party_size),
      offerDeclinedCount: Number(updated.offer_declined_count),
    });

    // ── 4. Save idempotency ───────────────────────────────────────────────
    const commandResult = mapHostWaitlistRow(updated);
    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'declineTableOffer',
      commandResult,
    );

    return { result: commandResult, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.waitlist.offer_declined', 'waitlist_entry', input.waitlistEntryId);

  return result;
}
