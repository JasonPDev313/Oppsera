import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { HostSeatFromWaitlistInput } from '../validation-host';
import { validateWaitlistTransition } from '../validation-host';
import { fetchHostWaitlistEntry, mapHostWaitlistRow } from './host-helpers';
import { suggestTables } from '../queries/suggest-tables';
import type { TableSuggestion } from '../services/table-assigner';

/**
 * HOST V2: Seat a party from the waitlist.
 *
 * Two modes:
 * 1. `tableIds` provided → seat at those tables (validates state machine, inserts turn log)
 * 2. `tableIds` not provided → return table suggestions without seating
 */
export async function hostSeatFromWaitlist(
  ctx: RequestContext,
  entryId: string,
  input: Partial<HostSeatFromWaitlistInput>,
): Promise<{ data: Record<string, unknown>; suggestions?: TableSuggestion[] }> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to seat from waitlist');
  }
  // If no tableIds provided, return suggestions instead of seating
  if (!input.tableIds || input.tableIds.length === 0) {
    const existing = await fetchWaitlistReadOnly(ctx.tenantId, entryId);
    const partySize = Number(existing.party_size);
    const preference = existing.seating_preference ? String(existing.seating_preference) : undefined;
    const customerId = existing.customer_id ? String(existing.customer_id) : undefined;

    const suggestions = await suggestTables({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      partySize,
      seatingPreference: preference,
      customerId,
    });

    return { data: mapHostWaitlistRow(existing), suggestions };
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostWaitlistEntry(tx, ctx.tenantId, entryId);
    const oldStatus = String(existing.status);

    if (!validateWaitlistTransition(oldStatus, 'seated')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition waitlist entry from '${oldStatus}' to 'seated'`,
        409,
      );
    }

    // Calculate actual wait time
    const now = new Date();
    const addedAt = new Date(String(existing.added_at ?? existing.created_at));
    const actualWaitMinutes = Math.round((now.getTime() - addedAt.getTime()) / 60_000);

    // Primary table is the first in the array
    const tableIds = input.tableIds!;
    const primaryTableId = tableIds[0]!;

    // Update waitlist entry
    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'seated',
          seated_at = now(),
          actual_wait_minutes = ${actualWaitMinutes},
          seated_table_id = ${primaryTableId},
          seated_server_user_id = ${input.serverUserId ?? null},
          updated_at = now()
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Insert table turn log entry for each table
    const dayOfWeek = now.getDay();
    const partySize = Number(existing.party_size);
    const mealPeriod = existing.meal_period ? String(existing.meal_period) : 'dinner';

    for (const tableId of tableIds) {
      await tx.execute(sql`
        INSERT INTO fnb_table_turn_log (
          id, tenant_id, location_id, table_id,
          seated_at, party_size, meal_period, day_of_week,
          waitlist_entry_id
        ) VALUES (
          gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
          ${tableId},
          now(), ${partySize}, ${mealPeriod}, ${dayOfWeek},
          ${entryId}
        )
      `);
    }

    // Recompute positions for remaining waiting entries
    const businessDate = String(existing.business_date);
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) AS new_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      )
      UPDATE fnb_waitlist_entries w
      SET position = ranked.new_pos
      FROM ranked
      WHERE w.id = ranked.id
    `);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.seated.v1', {
      waitlistEntryId: entryId,
      tableIds: input.tableIds,
      guestName: String(existing.guest_name),
      partySize,
      actualWaitMinutes,
      serverUserId: input.serverUserId ?? null,
    });

    return { result: mapHostWaitlistRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.waitlist.seated', 'waitlist_entry', entryId);
  return { data: result };
}

/** Read-only fetch for suggestion mode (outside write transaction) */
async function fetchWaitlistReadOnly(
  tenantId: string,
  entryId: string,
): Promise<Record<string, unknown>> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT * FROM fnb_waitlist_entries
      WHERE id = ${entryId} AND tenant_id = ${tenantId}
    `);
    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!row) {
      throw new AppError('NOT_FOUND', `Waitlist entry ${entryId} not found`, 404);
    }
    return row;
  });
}
