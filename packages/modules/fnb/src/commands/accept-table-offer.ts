// ── Command: accept-table-offer ───────────────────────────────────────────
// A waitlist party accepts the offered table.
// Performs the full seat-party inline (same transaction):
//  - Updates table live status → 'seated'
//  - Creates a POS tab + default course
//  - Updates waitlist entry → 'seated', clears offer fields
//  - Inserts table turn log
//  - Recomputes waitlist positions
// Emits: fnb.waitlist.offer_accepted.v1 + fnb.party.seated.v1

import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { fnbTabs, fnbTabCourses, fnbTableStatusHistory, fnbTableTurnLog } from '@oppsera/db';
import { HOST_EVENTS } from '../events/host-events';
import { FNB_EVENTS } from '../events/types';
import { mapHostWaitlistRow } from './host-helpers';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AcceptTableOfferInput {
  waitlistEntryId: string;
  clientRequestId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function inferMealPeriod(date: Date): string {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  return 'dinner';
}

// ── Command ───────────────────────────────────────────────────────────────

/**
 * Accept a pending table offer for a waitlist entry.
 *
 * Validations (inside a single transaction):
 *  1. Waitlist entry has status 'waiting' or 'notified'
 *  2. Entry has a non-null offeredTableId
 *  3. Offer has not expired (offer_expires_at > now())
 *  4. Table is still 'available'
 *
 * On success, seating happens inline — no second command needed.
 *
 * Emits: fnb.waitlist.offer_accepted.v1, fnb.party.seated.v1,
 *        fnb.tab.opened.v1, fnb.table.status_changed.v1
 */
export async function acceptTableOffer(
  ctx: RequestContext,
  input: AcceptTableOfferInput,
): Promise<Record<string, unknown>> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to accept a table offer');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {

    // ── Idempotency ──────────────────────────────────────────────────────
    const idempotency = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'acceptTableOffer',
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
        `Waitlist entry is '${entryStatus}'; must be 'waiting' or 'notified' to accept an offer`,
        409,
      );
    }

    if (!entry.offered_table_id) {
      throw new AppError(
        'NO_OFFER',
        `Waitlist entry ${input.waitlistEntryId} has no pending table offer`,
        409,
      );
    }

    // ── 2. Validate offer has not expired ────────────────────────────────
    // Use DB server time (NOW()) rather than JS Date to avoid clock skew /
    // timezone mismatches between application server and database server.
    if (entry.offer_expires_at) {
      const expiryCheckRows = await tx.execute(sql`
        SELECT (${String(entry.offer_expires_at)}::timestamptz <= NOW()) AS is_expired
      `);
      const expiryCheckArr = Array.from(expiryCheckRows as Iterable<Record<string, unknown>>);
      const isExpired = Boolean(expiryCheckArr[0]?.is_expired);
      if (isExpired) {
        throw new AppError(
          'OFFER_EXPIRED',
          `The table offer for entry ${input.waitlistEntryId} has expired`,
          409,
        );
      }
    }

    const offeredTableId = String(entry.offered_table_id);

    // ── 3. Lock + validate table is still available ───────────────────────
    const tableRows = await tx.execute(sql`
      SELECT
        ls.id    AS live_status_id,
        ls.status,
        ls.version,
        t.room_id,
        t.capacity_min,
        t.capacity_max,
        t.table_type
      FROM fnb_table_live_status ls
      INNER JOIN fnb_tables t ON t.id = ls.table_id AND t.tenant_id = ls.tenant_id
      WHERE ls.table_id  = ${offeredTableId}
        AND ls.tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);
    const tableArr = Array.from(tableRows as Iterable<Record<string, unknown>>);
    if (tableArr.length === 0) {
      throw new AppError('NOT_FOUND', `Table ${offeredTableId} not found`, 404);
    }
    const tableRow = tableArr[0]!;
    if (String(tableRow.status) !== 'available') {
      throw new AppError(
        'TABLE_NOT_AVAILABLE',
        `Table ${offeredTableId} is no longer available (status: ${tableRow.status})`,
        409,
      );
    }

    // ── 4. Resolve business date ──────────────────────────────────────────
    const businessDate = String(entry.business_date ?? new Date().toISOString().slice(0, 10));

    // ── 5. Resolve server ─────────────────────────────────────────────────
    let serverUserId: string;
    const rotationRows = await tx.execute(sql`
      SELECT next_server_user_id
      FROM fnb_rotation_tracker
      WHERE tenant_id    = ${ctx.tenantId}
        AND location_id  = ${ctx.locationId}
        AND business_date = ${businessDate}
      LIMIT 1
    `);
    const rotationArr = Array.from(rotationRows as Iterable<Record<string, unknown>>);
    if (rotationArr.length > 0 && rotationArr[0]!.next_server_user_id) {
      serverUserId = String(rotationArr[0]!.next_server_user_id);
    } else {
      const assignRows = await tx.execute(sql`
        SELECT server_user_id
        FROM fnb_server_assignments
        WHERE tenant_id   = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${businessDate}
          AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
      `);
      const assignArr = Array.from(assignRows as Iterable<Record<string, unknown>>);
      serverUserId = assignArr.length > 0 && assignArr[0]!.server_user_id
        ? String(assignArr[0]!.server_user_id)
        : ctx.user.id;
    }

    // ── 6. Get next tab number ─────────────────────────────────────────────
    const counterRows = await tx.execute(sql`
      INSERT INTO fnb_tab_counters (tenant_id, location_id, business_date, last_number)
      VALUES (${ctx.tenantId}, ${ctx.locationId}, ${businessDate}, 1)
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET last_number = fnb_tab_counters.last_number + 1
      RETURNING last_number
    `);
    const tabNumber = Number(
      Array.from(counterRows as Iterable<Record<string, unknown>>)[0]!.last_number,
    );

    const partySize = Number(entry.party_size);
    const guestName = String(entry.guest_name);
    const now = new Date();
    const mealPeriod = inferMealPeriod(now);
    const currentVersion = Number(tableRow.version);
    const newVersion = currentVersion + 1;
    const liveStatusId = String(tableRow.live_status_id);

    // ── 7. Create POS tab ─────────────────────────────────────────────────
    const [createdTab] = await tx
      .insert(fnbTabs)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        tabNumber,
        tabType: 'dine_in',
        status: 'open',
        tableId: offeredTableId,
        serverUserId,
        openedBy: ctx.user.id,
        partySize,
        guestName,
        serviceType: 'dine_in',
        businessDate,
        currentCourseNumber: 1,
        version: 1,
      })
      .returning();

    const tabId = createdTab!.id;

    // ── 8. Create default course ───────────────────────────────────────────
    await tx
      .insert(fnbTabCourses)
      .values({
        tenantId: ctx.tenantId,
        tabId,
        courseNumber: 1,
        courseName: 'Course 1',
        courseStatus: 'unsent',
      });

    // ── 9. Update table live status (optimistic lock) ──────────────────────
    const updatedStatusRows = await tx.execute(sql`
      UPDATE fnb_table_live_status
      SET
        status                 = 'seated',
        current_tab_id         = ${tabId},
        current_server_user_id = ${serverUserId},
        party_size             = ${partySize},
        seated_at              = now(),
        guest_names            = ${guestName},
        version                = ${newVersion},
        updated_at             = now()
      WHERE id        = ${liveStatusId}
        AND tenant_id = ${ctx.tenantId}
        AND version   = ${currentVersion}
      RETURNING version
    `);
    const updatedStatusArr = Array.from(updatedStatusRows as Iterable<Record<string, unknown>>);
    if (updatedStatusArr.length === 0) {
      throw new AppError(
        'TABLE_VERSION_CONFLICT',
        `Concurrent modification detected on table ${offeredTableId}`,
        409,
      );
    }

    // ── 10. Insert status history ─────────────────────────────────────────
    await tx
      .insert(fnbTableStatusHistory)
      .values({
        tenantId: ctx.tenantId,
        tableId: offeredTableId,
        oldStatus: 'available',
        newStatus: 'seated',
        changedBy: ctx.user.id,
        partySize,
        serverUserId,
        tabId,
        metadata: { source: 'waitlist', sourceId: input.waitlistEntryId },
      });

    // ── 11. Insert turn log ───────────────────────────────────────────────
    await tx
      .insert(fnbTableTurnLog)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        tableId: offeredTableId,
        partySize,
        mealPeriod,
        seatedAt: now,
        dayOfWeek: now.getDay(),
        wasReservation: false,
        waitlistEntryId: input.waitlistEntryId,
      });

    // ── 12. Update waitlist entry — mark seated, clear offer fields ────────
    const addedAt = new Date(String(entry.added_at ?? entry.created_at));
    const actualWaitMinutes = Math.round((now.getTime() - addedAt.getTime()) / 60_000);

    const finalEntryRows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET
        status                = 'seated',
        seated_at             = now(),
        actual_wait_minutes   = ${actualWaitMinutes},
        seated_table_id       = ${offeredTableId},
        seated_server_user_id = ${serverUserId},
        tab_id                = ${tabId},
        offered_table_id      = NULL,
        offered_at            = NULL,
        offer_expires_at      = NULL,
        updated_at            = now()
      WHERE id        = ${input.waitlistEntryId}
        AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);
    const finalEntry = Array.from(finalEntryRows as Iterable<Record<string, unknown>>)[0]!;

    // ── 13. Recompute waitlist positions ───────────────────────────────────
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) AS new_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id   = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      )
      UPDATE fnb_waitlist_entries w
      SET position = ranked.new_pos
      FROM ranked
      WHERE w.id = ranked.id
    `);

    // ── 14. Build events ──────────────────────────────────────────────────
    const events = [];

    events.push(
      buildEventFromContext(ctx, HOST_EVENTS.WAITLIST_OFFER_ACCEPTED, {
        waitlistEntryId: input.waitlistEntryId,
        tableId: offeredTableId,
        tabId,
        guestName,
        partySize,
        actualWaitMinutes,
      }),
    );

    events.push(
      buildEventFromContext(ctx, HOST_EVENTS.PARTY_SEATED, {
        tabId,
        tabNumber,
        tableIds: [offeredTableId],
        partySize,
        guestNames: guestName,
        serverUserId,
        sourceType: 'waitlist',
        sourceId: input.waitlistEntryId,
        businessDate,
        mealPeriod,
      }),
    );

    events.push(
      buildEventFromContext(ctx, FNB_EVENTS.TAB_OPENED, {
        tabId,
        locationId: ctx.locationId,
        tabNumber,
        tabType: 'dine_in',
        tableId: offeredTableId,
        serverUserId,
        businessDate,
        partySize,
      }),
    );

    events.push(
      buildEventFromContext(ctx, FNB_EVENTS.TABLE_STATUS_CHANGED, {
        tableId: offeredTableId,
        roomId: tableRow.room_id ? String(tableRow.room_id) : null,
        locationId: ctx.locationId,
        oldStatus: 'available',
        newStatus: 'seated',
        partySize,
        serverUserId,
        tabId,
      }),
    );

    // ── 15. Save idempotency ──────────────────────────────────────────────
    const commandResult = {
      ...mapHostWaitlistRow(finalEntry),
      tabId,
      tabNumber,
      tableId: offeredTableId,
      serverUserId,
    };
    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'acceptTableOffer',
      commandResult,
    );

    return { result: commandResult, events };
  });

  await auditLog(ctx, 'fnb.waitlist.offer_accepted', 'waitlist_entry', input.waitlistEntryId);

  return result;
}
