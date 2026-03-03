// ── Command: offer-table-to-waitlist ─────────────────────────────────────
// Host explicitly offers a specific table to a specific waitlist entry.
// Uses publishWithOutbox for transactional safety + event emission.

import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { HOST_EVENTS } from '../events/host-events';
import { mapHostWaitlistRow } from './host-helpers';

// ── Types ─────────────────────────────────────────────────────────────────

export interface OfferTableToWaitlistInput {
  waitlistEntryId: string;
  tableId: string;
  expiryMinutes?: number;
  clientRequestId?: string;
}

// ── Default ───────────────────────────────────────────────────────────────

const DEFAULT_EXPIRY_MINUTES = 10;

// ── Command ───────────────────────────────────────────────────────────────

/**
 * Manually offer a specific table to a specific waitlist entry.
 *
 * Validations (all inside a single serializable transaction):
 *  1. Waitlist entry exists and is 'waiting' or 'notified'
 *  2. Table live status is 'available'
 *  3. Offer fields are written atomically
 *
 * Emits: fnb.waitlist.table_offered.v1
 */
export async function offerTableToWaitlist(
  ctx: RequestContext,
  input: OfferTableToWaitlistInput,
): Promise<Record<string, unknown>> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to offer a table');
  }

  const expiryMinutes = input.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES;

  const result = await publishWithOutbox(ctx, async (tx) => {

    // ── Idempotency ──────────────────────────────────────────────────────
    const idempotency = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'offerTableToWaitlist',
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
        `Waitlist entry is '${entryStatus}'; must be 'waiting' or 'notified' to receive an offer`,
        409,
      );
    }

    // ── 2. Lock + validate table live status ─────────────────────────────
    const tableRows = await tx.execute(sql`
      SELECT ls.status, t.capacity_min, t.capacity_max, t.table_type
      FROM fnb_table_live_status ls
      INNER JOIN fnb_tables t ON t.id = ls.table_id AND t.tenant_id = ls.tenant_id
      WHERE ls.table_id  = ${input.tableId}
        AND ls.tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);
    const tableArr = Array.from(tableRows as Iterable<Record<string, unknown>>);
    if (tableArr.length === 0) {
      throw new AppError('NOT_FOUND', `Table ${input.tableId} not found`, 404);
    }
    const tableRow = tableArr[0]!;
    if (String(tableRow.status) !== 'available') {
      throw new AppError(
        'TABLE_NOT_AVAILABLE',
        `Table ${input.tableId} is '${tableRow.status}', not 'available'`,
        409,
      );
    }

    // Validate party fit
    const partySize = Number(entry.party_size);
    const capacityMax = Number(tableRow.capacity_max);
    if (partySize > capacityMax) {
      throw new AppError(
        'PARTY_TOO_LARGE',
        `Party of ${partySize} does not fit table with capacity ${capacityMax}`,
        422,
      );
    }

    // ── 3. Write the offer — also advance status to 'notified' ───────────
    // This ensures the entry moves out of 'waiting' immediately so subsequent
    // promoter runs do not try to re-offer the same table.
    const updatedRows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET
        status            = 'notified',
        offered_table_id  = ${input.tableId},
        offered_at        = now(),
        offer_expires_at  = now() + (${expiryMinutes} || ' minutes')::interval,
        notified_at       = COALESCE(notified_at, now()),
        updated_at        = now()
      WHERE id        = ${input.waitlistEntryId}
        AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);
    const updated = Array.from(updatedRows as Iterable<Record<string, unknown>>)[0]!;

    // ── 4. Build event ────────────────────────────────────────────────────
    const event = buildEventFromContext(ctx, HOST_EVENTS.WAITLIST_TABLE_OFFERED, {
      waitlistEntryId: input.waitlistEntryId,
      tableId: input.tableId,
      expiryMinutes,
      guestName: String(entry.guest_name),
      partySize,
      offeredBy: ctx.user.id,
    });

    // ── 5. Save idempotency ───────────────────────────────────────────────
    const commandResult = mapHostWaitlistRow(updated);
    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'offerTableToWaitlist',
      commandResult,
    );

    return { result: commandResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.waitlist.table_offered', 'waitlist_entry', input.waitlistEntryId);

  return result;
}
