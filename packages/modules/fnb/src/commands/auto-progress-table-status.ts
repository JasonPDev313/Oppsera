import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { fnbTableStatusHistory } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { HOST_EVENTS } from '../events/host-events';

// ── Status ordering for forward-only progression ─────────────────
// blocked (99) is a special "out-of-band" status — never auto-progressed
export const STATUS_ORDER: Record<string, number> = {
  available: 0,
  reserved: 1,
  seated: 2,
  ordered: 3,
  entrees_fired: 4,
  dessert: 5,
  check_presented: 6,
  paid: 7,
  dirty: 8,
  blocked: 99,
};

export interface AutoProgressTableStatusInput {
  tableId: string;
  targetStatus: string;
  triggeredBy: string;
  tabId?: string;
  /** When true, clear all session fields (current_tab_id, server, party, etc.) */
  clearFields?: boolean;
}

export interface AutoProgressResult {
  progressed: boolean;
  oldStatus: string;
  newStatus: string;
}

/**
 * Auto-progress a table's live status based on POS tab lifecycle events.
 *
 * Rules:
 *  - Status only advances forward (higher STATUS_ORDER rank).
 *  - Transitioning to 'dirty' is always allowed regardless of current status
 *    (e.g., manager force-clears a table that was partially through service).
 *  - Transitioning to 'available' is always allowed (busser marks clean).
 *  - All other backward transitions are silently ignored (return null).
 *  - Uses a SELECT ... FOR UPDATE row lock to prevent concurrent status races.
 *  - Version column is incremented on every update (optimistic locking signal
 *    for UI subscribers).
 */
export async function autoProgressTableStatus(
  ctx: RequestContext,
  input: AutoProgressTableStatusInput,
): Promise<AutoProgressResult | null> {
  const { tableId, targetStatus, triggeredBy, tabId, clearFields } = input;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Lock the live-status row for this table
    const lockRows = await tx.execute(sql`
      SELECT
        ls.id              AS live_status_id,
        ls.status          AS current_status,
        ls.version,
        t.room_id,
        t.location_id
      FROM fnb_table_live_status ls
      INNER JOIN fnb_tables t ON t.id = ls.table_id
      WHERE ls.table_id  = ${tableId}
        AND ls.tenant_id = ${ctx.tenantId}
      LIMIT 1
      FOR UPDATE
    `);

    const rows = Array.from(lockRows as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      // Table not found — silently skip (consumer must not throw)
      return { result: null, events: [] };
    }

    const row = rows[0]!;
    const liveStatusId = String(row.live_status_id);
    const currentStatus = String(row.current_status);
    const currentVersion = Number(row.version);

    // 2. Forward-only gate
    const targetRank = STATUS_ORDER[targetStatus] ?? -1;
    const currentRank = STATUS_ORDER[currentStatus] ?? -1;

    const isDirtyTransition = targetStatus === 'dirty';
    const isAvailableTransition = targetStatus === 'available';

    if (!isDirtyTransition && !isAvailableTransition) {
      if (targetRank <= currentRank) {
        // Already at or past this status — skip silently
        return { result: null, events: [] };
      }
    }

    // 3. Build the UPDATE statement dynamically
    //    We use a single SQL template to keep the update atomic.
    const newVersion = currentVersion + 1;

    let updateResult;

    if (clearFields) {
      // Clear all session data (dirty transition after tab close, or available after bussing)
      if (isDirtyTransition) {
        updateResult = await tx.execute(sql`
          UPDATE fnb_table_live_status
          SET
            status                  = ${targetStatus},
            version                 = ${newVersion},
            updated_at              = NOW(),
            current_tab_id          = NULL,
            current_server_user_id  = NULL,
            party_size              = NULL,
            seated_at               = NULL,
            guest_names             = NULL,
            waitlist_entry_id       = NULL,
            dirty_since             = NOW()
          WHERE id         = ${liveStatusId}
            AND tenant_id  = ${ctx.tenantId}
            AND version    = ${currentVersion}
          RETURNING id
        `);
      } else {
        // available — also null out dirty_since
        updateResult = await tx.execute(sql`
          UPDATE fnb_table_live_status
          SET
            status                  = ${targetStatus},
            version                 = ${newVersion},
            updated_at              = NOW(),
            current_tab_id          = NULL,
            current_server_user_id  = NULL,
            party_size              = NULL,
            seated_at               = NULL,
            guest_names             = NULL,
            waitlist_entry_id       = NULL,
            dirty_since             = NULL
          WHERE id         = ${liveStatusId}
            AND tenant_id  = ${ctx.tenantId}
            AND version    = ${currentVersion}
          RETURNING id
        `);
      }
    } else if (isDirtyTransition) {
      // Dirty without clearFields: update status + dirty_since only
      updateResult = await tx.execute(sql`
        UPDATE fnb_table_live_status
        SET
          status      = ${targetStatus},
          version     = ${newVersion},
          updated_at  = NOW(),
          dirty_since = NOW()
        WHERE id        = ${liveStatusId}
          AND tenant_id = ${ctx.tenantId}
          AND version   = ${currentVersion}
        RETURNING id
      `);
    } else if (isAvailableTransition) {
      // Available without explicit clearFields: null dirty_since
      updateResult = await tx.execute(sql`
        UPDATE fnb_table_live_status
        SET
          status      = ${targetStatus},
          version     = ${newVersion},
          updated_at  = NOW(),
          dirty_since = NULL
        WHERE id        = ${liveStatusId}
          AND tenant_id = ${ctx.tenantId}
          AND version   = ${currentVersion}
        RETURNING id
      `);
    } else {
      // Standard forward progression
      updateResult = await tx.execute(sql`
        UPDATE fnb_table_live_status
        SET
          status     = ${targetStatus},
          version    = ${newVersion},
          updated_at = NOW()
        WHERE id        = ${liveStatusId}
          AND tenant_id = ${ctx.tenantId}
          AND version   = ${currentVersion}
        RETURNING id
      `);
    }

    // If no rows were updated, a concurrent write won the optimistic lock race.
    // Silently skip — the winning writer already advanced the status.
    const updatedRows = Array.from(updateResult as Iterable<Record<string, unknown>>);
    if (updatedRows.length === 0) {
      return { result: null, events: [] };
    }

    // 4. Record status history
    await tx
      .insert(fnbTableStatusHistory)
      .values({
        tenantId: ctx.tenantId,
        tableId,
        oldStatus: currentStatus,
        newStatus: targetStatus,
        changedBy: ctx.user.id,
        partySize: null,
        serverUserId: null,
        metadata: {
          source: 'auto_progress',
          triggeredBy,
          tabId: tabId ?? null,
        },
      });

    // 5. Emit event
    const event = buildEventFromContext(ctx, HOST_EVENTS.TABLE_AUTO_PROGRESSED, {
      tableId,
      locationId: String(row.location_id),
      fromStatus: currentStatus,
      toStatus: targetStatus,
      triggeredBy,
      tabId: tabId ?? null,
    });

    const progressResult: AutoProgressResult = {
      progressed: true,
      oldStatus: currentStatus,
      newStatus: targetStatus,
    };

    return { result: progressResult, events: [event] };
  });

  if (!result || !result.progressed) {
    return null;
  }

  auditLogDeferred(
    ctx,
    'fnb.table.auto_progressed',
    'fnb_table_live_status',
    tableId,
    { status: { old: result.oldStatus, new: result.newStatus } },
    { triggeredBy, tabId: tabId ?? null },
  );

  return result;
}
