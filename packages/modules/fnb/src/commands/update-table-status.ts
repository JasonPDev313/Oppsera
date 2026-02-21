import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbTables, fnbTableLiveStatus, fnbTableStatusHistory } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTableStatusInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TableNotFoundError, TableVersionConflictError } from '../errors';

/**
 * Updates a table's live status with optimistic locking.
 * Concurrency safety: uses version column to prevent two hosts from seating the same table.
 * Logs status transitions to fnb_table_status_history for analytics.
 */
export async function updateTableStatus(
  ctx: RequestContext,
  tableId: string,
  input: UpdateTableStatusInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch current status with table info
    const rows = await (tx as any).execute(sql`
      SELECT
        ls.id AS live_status_id,
        ls.status AS current_status,
        ls.current_tab_id,
        ls.current_server_user_id,
        ls.version,
        ls.party_size AS current_party_size,
        t.id AS table_id,
        t.room_id,
        t.location_id,
        t.tenant_id
      FROM fnb_table_live_status ls
      INNER JOIN fnb_tables t ON t.id = ls.table_id
      WHERE ls.table_id = ${tableId}
        AND ls.tenant_id = ${ctx.tenantId}
      LIMIT 1
    `);

    const statusRows = Array.from(rows as Iterable<Record<string, unknown>>);
    if (statusRows.length === 0) throw new TableNotFoundError(tableId);

    const current = statusRows[0]!;
    const currentVersion = Number(current.version);

    // Optimistic locking: reject stale writes
    if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
      throw new TableVersionConflictError(tableId);
    }

    const oldStatus = String(current.current_status);
    const newStatus = input.status;

    // Build update payload
    const updateValues: Record<string, unknown> = {
      status: newStatus,
      version: currentVersion + 1,
      updatedAt: new Date(),
    };

    if (newStatus === 'seated') {
      updateValues.seatedAt = new Date();
      if (input.partySize) updateValues.partySize = input.partySize;
      if (input.serverUserId) updateValues.currentServerUserId = input.serverUserId;
      if (input.guestNames !== undefined) updateValues.guestNames = input.guestNames;
      if (input.waitlistEntryId) updateValues.waitlistEntryId = input.waitlistEntryId;
    } else if (newStatus === 'available') {
      // Clear all session data when table becomes available
      updateValues.seatedAt = null;
      updateValues.partySize = null;
      updateValues.currentServerUserId = null;
      updateValues.currentTabId = null;
      updateValues.guestNames = null;
      updateValues.waitlistEntryId = null;
      updateValues.combineGroupId = null;
      updateValues.estimatedTurnTimeMinutes = null;
    }

    if (input.serverUserId && newStatus !== 'available') {
      updateValues.currentServerUserId = input.serverUserId;
    }

    // Update with optimistic lock check
    const updated = await (tx as any).execute(sql`
      UPDATE fnb_table_live_status
      SET
        status = ${newStatus},
        version = ${currentVersion + 1},
        updated_at = NOW(),
        seated_at = ${updateValues.seatedAt !== undefined ? updateValues.seatedAt : sql`seated_at`},
        party_size = ${updateValues.partySize !== undefined ? updateValues.partySize : sql`party_size`},
        current_server_user_id = ${updateValues.currentServerUserId !== undefined ? updateValues.currentServerUserId : sql`current_server_user_id`},
        current_tab_id = ${updateValues.currentTabId !== undefined ? updateValues.currentTabId : sql`current_tab_id`},
        guest_names = ${updateValues.guestNames !== undefined ? updateValues.guestNames : sql`guest_names`},
        waitlist_entry_id = ${updateValues.waitlistEntryId !== undefined ? updateValues.waitlistEntryId : sql`waitlist_entry_id`},
        combine_group_id = ${updateValues.combineGroupId !== undefined ? updateValues.combineGroupId : sql`combine_group_id`},
        estimated_turn_time_minutes = ${updateValues.estimatedTurnTimeMinutes !== undefined ? updateValues.estimatedTurnTimeMinutes : sql`estimated_turn_time_minutes`}
      WHERE id = ${String(current.live_status_id)}
        AND tenant_id = ${ctx.tenantId}
        AND version = ${currentVersion}
      RETURNING *
    `);

    const updatedRows = Array.from(updated as Iterable<Record<string, unknown>>);
    if (updatedRows.length === 0) {
      throw new TableVersionConflictError(tableId);
    }

    // Log status transition
    await (tx as any)
      .insert(fnbTableStatusHistory)
      .values({
        tenantId: ctx.tenantId,
        tableId,
        oldStatus,
        newStatus,
        changedBy: ctx.user.id,
        partySize: input.partySize ?? null,
        serverUserId: input.serverUserId ?? null,
        metadata: { source: 'manual' },
      });

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLE_STATUS_CHANGED, {
      tableId,
      roomId: String(current.room_id),
      locationId: String(current.location_id),
      oldStatus,
      newStatus,
      partySize: input.partySize ?? null,
      serverUserId: input.serverUserId ?? null,
      tabId: updatedRows[0]!.current_tab_id ?? null,
    });

    return {
      result: {
        tableId,
        oldStatus,
        newStatus,
        version: currentVersion + 1,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.table.status_changed', 'fnb_table_live_status', tableId, {
    status: { old: result.oldStatus, new: result.newStatus },
  });

  return result;
}
