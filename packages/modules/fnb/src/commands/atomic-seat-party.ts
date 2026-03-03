import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabCourses, fnbTableStatusHistory, fnbTableTurnLog } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { FNB_EVENTS } from '../events/types';
import { HOST_EVENTS } from '../events/host-events';

// ── Types ────────────────────────────────────────────────────────

export interface AtomicSeatPartyInput {
  tableIds: string[];
  partySize: number;
  guestNames?: string;
  serverUserId?: string;
  sourceType: 'reservation' | 'waitlist' | 'walk_in';
  sourceId?: string;
  clientRequestId?: string;
  businessDate: string; // YYYY-MM-DD
}

export interface AtomicSeatPartyResult {
  tabId: string;
  tabNumber: number;
  tableStatuses: Array<{ tableId: string; version: number }>;
  serverUserId: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function inferMealPeriod(date: Date): string {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  return 'dinner';
}

// ── Command ──────────────────────────────────────────────────────

/**
 * Atomically seats a party by:
 *  1. Locking all target tables (FOR UPDATE)
 *  2. Creating a POS tab + default course
 *  3. Updating all table live statuses
 *  4. Inserting status history + turn log rows
 *  5. Updating reservation or waitlist source record
 *  6. Emitting events: fnb.party.seated.v1, fnb.tab.opened.v1,
 *     fnb.table.status_changed.v1 per table
 *
 * All writes happen inside a single publishWithOutbox transaction.
 */
export async function atomicSeatParty(
  ctx: RequestContext,
  input: AtomicSeatPartyInput,
): Promise<AtomicSeatPartyResult> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to seat a party');
  }

  // ── Input validation ─────────────────────────────────────────────
  if (!input.tableIds || input.tableIds.length === 0) {
    throw new AppError('INVALID_INPUT', 'At least one table ID is required', 400);
  }

  if (!Number.isInteger(input.partySize) || input.partySize <= 0) {
    throw new AppError('INVALID_INPUT', 'partySize must be a positive integer', 400);
  }

  // Validate businessDate format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
    throw new AppError('INVALID_INPUT', 'businessDate must be in YYYY-MM-DD format', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // ── 1. Idempotency check ────────────────────────────────────
    // Skip idempotency if no clientRequestId was provided
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'atomicSeatParty',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as AtomicSeatPartyResult, events: [] };
      }
    }

    // ── 2. Lock table rows ──────────────────────────────────────
    // Deduplicate table IDs to prevent locking the same row twice
    // (duplicate IDs would cause incorrect version increments and
    // double-inserts into status history / turn log).
    const tableIdList = [...new Set(input.tableIds)];
    const lockedRows = await (tx as any).execute(sql`
      SELECT
        ls.id          AS live_status_id,
        ls.table_id,
        ls.status      AS current_status,
        ls.version,
        t.room_id,
        t.location_id
      FROM fnb_table_live_status ls
      INNER JOIN fnb_tables t ON t.id = ls.table_id
      WHERE ls.table_id = ANY(${tableIdList}::text[])
        AND ls.tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);

    const lockedArr = Array.from(lockedRows as Iterable<Record<string, unknown>>);

    // ── 3. Validate availability ────────────────────────────────
    // All tables must be 'available' or 'reserved' to seat.
    const unavailable = lockedArr.filter((r) => {
      const s = String(r.current_status);
      return s !== 'available' && s !== 'reserved';
    });

    if (unavailable.length > 0) {
      const ids = unavailable.map((r) => String(r.table_id)).join(', ');
      throw new AppError(
        'TABLE_NOT_AVAILABLE',
        `Tables are not available for seating: ${ids}`,
        409,
      );
    }

    // Build a lookup map: tableId → locked row
    const tableMap = new Map<string, Record<string, unknown>>();
    for (const row of lockedArr) {
      tableMap.set(String(row.table_id), row);
    }

    // If any requested table was not found in live status, reject
    const missingTables = tableIdList.filter((id) => !tableMap.has(id));
    if (missingTables.length > 0) {
      throw new AppError(
        'TABLE_NOT_FOUND',
        `Tables not found in floor plan: ${missingTables.join(', ')}`,
        404,
      );
    }

    // ── 4. Resolve server ────────────────────────────────────────
    let resolvedServerUserId: string;

    if (input.serverUserId) {
      resolvedServerUserId = input.serverUserId;
    } else {
      // Try rotation tracker first
      const rotationRows = await (tx as any).execute(sql`
        SELECT next_server_user_id
        FROM fnb_rotation_tracker
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${input.businessDate}
        LIMIT 1
      `);
      const rotationArr = Array.from(rotationRows as Iterable<Record<string, unknown>>);

      if (rotationArr.length > 0 && rotationArr[0]!.next_server_user_id) {
        resolvedServerUserId = String(rotationArr[0]!.next_server_user_id);
      } else {
        // Fallback: first active server assignment for this location/date
        const assignmentRows = await (tx as any).execute(sql`
          SELECT server_user_id
          FROM fnb_server_assignments
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${ctx.locationId}
            AND business_date = ${input.businessDate}
            AND status = 'active'
          ORDER BY created_at ASC
          LIMIT 1
        `);
        const assignmentArr = Array.from(assignmentRows as Iterable<Record<string, unknown>>);

        if (assignmentArr.length > 0 && assignmentArr[0]!.server_user_id) {
          resolvedServerUserId = String(assignmentArr[0]!.server_user_id);
        } else {
          // Last resort: the acting user
          resolvedServerUserId = ctx.user.id;
        }
      }
    }

    // ── 5. Get next tab number ───────────────────────────────────
    const counterResult = await (tx as any).execute(sql`
      INSERT INTO fnb_tab_counters (tenant_id, location_id, business_date, last_number)
      VALUES (${ctx.tenantId}, ${ctx.locationId}, ${input.businessDate}, 1)
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET last_number = fnb_tab_counters.last_number + 1
      RETURNING last_number
    `);
    const tabNumber = Number(
      Array.from(counterResult as Iterable<Record<string, unknown>>)[0]!.last_number,
    );

    // ── 6. Create tab ────────────────────────────────────────────
    const primaryTableId = tableIdList[0]!;

    const [createdTab] = await (tx as any)
      .insert(fnbTabs)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        tabNumber,
        tabType: 'dine_in',
        status: 'open',
        tableId: primaryTableId,
        serverUserId: resolvedServerUserId,
        openedBy: ctx.user.id,
        partySize: input.partySize,
        guestName: input.guestNames ?? null,
        serviceType: 'dine_in',
        businessDate: input.businessDate,
        currentCourseNumber: 1,
        version: 1,
      })
      .returning();

    const tabId = createdTab!.id;

    // ── 7. Create default course ─────────────────────────────────
    await (tx as any)
      .insert(fnbTabCourses)
      .values({
        tenantId: ctx.tenantId,
        tabId,
        courseNumber: 1,
        courseName: 'Course 1',
        courseStatus: 'unsent',
      });

    // ── 8 & 9 & 10. Update live statuses + history + turn log ───
    const now = new Date();
    const mealPeriod = inferMealPeriod(now);
    const dayOfWeek = now.getDay();

    const tableStatusResults: Array<{ tableId: string; version: number }> = [];

    for (const tableId of tableIdList) {
      const lockedRow = tableMap.get(tableId)!;
      const oldStatus = String(lockedRow.current_status);
      const currentVersion = Number(lockedRow.version);
      const newVersion = currentVersion + 1;
      const liveStatusId = String(lockedRow.live_status_id);

      // Update live status with version increment
      const updatedStatus = await (tx as any).execute(sql`
        UPDATE fnb_table_live_status
        SET
          status                  = 'seated',
          current_tab_id          = ${tabId},
          current_server_user_id  = ${resolvedServerUserId},
          party_size              = ${input.partySize},
          seated_at               = now(),
          guest_names             = ${input.guestNames ?? null},
          version                 = ${newVersion},
          updated_at              = now()
        WHERE id = ${liveStatusId}
          AND tenant_id = ${ctx.tenantId}
          AND version = ${currentVersion}
        RETURNING version
      `);

      const updatedArr = Array.from(updatedStatus as Iterable<Record<string, unknown>>);
      if (updatedArr.length === 0) {
        // Concurrent write caused optimistic lock failure
        throw new AppError(
          'TABLE_VERSION_CONFLICT',
          `Concurrent modification detected on table ${tableId}`,
          409,
        );
      }

      tableStatusResults.push({ tableId, version: newVersion });

      // Insert status history row
      await (tx as any)
        .insert(fnbTableStatusHistory)
        .values({
          tenantId: ctx.tenantId,
          tableId,
          oldStatus,
          newStatus: 'seated',
          changedBy: ctx.user.id,
          partySize: input.partySize,
          serverUserId: resolvedServerUserId,
          tabId,
          metadata: { source: input.sourceType, sourceId: input.sourceId ?? null },
        });

      // Insert table turn log row
      await (tx as any)
        .insert(fnbTableTurnLog)
        .values({
          tenantId: ctx.tenantId,
          locationId: ctx.locationId,
          tableId,
          partySize: input.partySize,
          mealPeriod,
          seatedAt: now,
          dayOfWeek,
          wasReservation: input.sourceType === 'reservation',
          reservationId: input.sourceType === 'reservation' ? (input.sourceId ?? null) : null,
          waitlistEntryId: input.sourceType === 'waitlist' ? (input.sourceId ?? null) : null,
        });
    }

    // ── 11. Update reservation if source ─────────────────────────
    if (input.sourceType === 'reservation' && input.sourceId) {
      await (tx as any).execute(sql`
        UPDATE fnb_reservations
        SET
          status                  = 'seated',
          seated_at               = now(),
          assigned_table_id       = ${primaryTableId},
          assigned_server_user_id = ${resolvedServerUserId},
          tab_id                  = ${tabId},
          updated_at              = now()
        WHERE id = ${input.sourceId}
          AND tenant_id = ${ctx.tenantId}
      `);
    }

    // ── 12. Update waitlist entry and recompute positions ─────────
    if (input.sourceType === 'waitlist' && input.sourceId) {
      const entryRows = await (tx as any).execute(sql`
        SELECT added_at, created_at, business_date
        FROM fnb_waitlist_entries
        WHERE id = ${input.sourceId}
          AND tenant_id = ${ctx.tenantId}
      `);
      const entryArr = Array.from(entryRows as Iterable<Record<string, unknown>>);
      let actualWaitMinutes: number | null = null;

      if (entryArr.length > 0) {
        const entry = entryArr[0]!;
        const addedAt = new Date(String(entry.added_at ?? entry.created_at));
        actualWaitMinutes = Math.round((now.getTime() - addedAt.getTime()) / 60_000);
      }

      await (tx as any).execute(sql`
        UPDATE fnb_waitlist_entries
        SET
          status                = 'seated',
          seated_at             = now(),
          actual_wait_minutes   = ${actualWaitMinutes},
          seated_table_id       = ${primaryTableId},
          seated_server_user_id = ${resolvedServerUserId},
          tab_id                = ${tabId},
          updated_at            = now()
        WHERE id = ${input.sourceId}
          AND tenant_id = ${ctx.tenantId}
      `);

      // Recompute positions for remaining waiting entries
      const businessDate = input.businessDate;
      await (tx as any).execute(sql`
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
    }

    // ── 13. Build events ─────────────────────────────────────────
    const events = [];

    // Primary composite event: party seated
    const partySeatedEvent = buildEventFromContext(ctx, HOST_EVENTS.PARTY_SEATED, {
      tabId,
      tabNumber,
      tableIds: tableIdList,
      partySize: input.partySize,
      guestNames: input.guestNames ?? null,
      serverUserId: resolvedServerUserId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      businessDate: input.businessDate,
      mealPeriod,
    });
    events.push(partySeatedEvent);

    // Tab opened event
    const tabOpenedEvent = buildEventFromContext(ctx, FNB_EVENTS.TAB_OPENED, {
      tabId,
      locationId: ctx.locationId,
      tabNumber,
      tabType: 'dine_in',
      tableId: primaryTableId,
      serverUserId: resolvedServerUserId,
      businessDate: input.businessDate,
      partySize: input.partySize,
    });
    events.push(tabOpenedEvent);

    // Table status changed event per table
    for (const tableId of tableIdList) {
      const lockedRow = tableMap.get(tableId)!;
      const tableStatusChangedEvent = buildEventFromContext(ctx, FNB_EVENTS.TABLE_STATUS_CHANGED, {
        tableId,
        roomId: lockedRow.room_id ? String(lockedRow.room_id) : null,
        locationId: ctx.locationId,
        oldStatus: String(lockedRow.current_status),
        newStatus: 'seated',
        partySize: input.partySize,
        serverUserId: resolvedServerUserId,
        tabId,
      });
      events.push(tableStatusChangedEvent);
    }

    // ── 14. Save idempotency key ─────────────────────────────────
    const commandResult: AtomicSeatPartyResult = {
      tabId,
      tabNumber,
      tableStatuses: tableStatusResults,
      serverUserId: resolvedServerUserId,
    };
    // Only persist idempotency record when the caller supplied a key
    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'atomicSeatParty', commandResult);
    }

    return { result: commandResult, events };
  });

  // ── Audit log (after transaction) ───────────────────────────────
  await auditLog(ctx, 'fnb.party.seated', 'fnb_tabs', result.tabId);

  return result;
}
