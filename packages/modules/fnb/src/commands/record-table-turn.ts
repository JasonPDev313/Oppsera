import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { sql } from 'drizzle-orm';
import type { RecordTableTurnInput } from '../validation-host';

/**
 * HOST V2: Record the completion of a table turn.
 * Finds the open turn log entry (cleared_at IS NULL) for the given table
 * and closes it with the calculated turn time.
 * If no open entry exists, this is a no-op (no error).
 */
export async function recordTableTurn(
  ctx: RequestContext,
  input: RecordTableTurnInput,
) {
  return publishWithOutbox(ctx, async (tx) => {
    // Find the open turn log entry for this table
    const rows = await tx.execute(sql`
      UPDATE fnb_table_turn_log
      SET cleared_at = now(),
          turn_time_minutes = EXTRACT(EPOCH FROM (now() - seated_at)) / 60
      WHERE tenant_id = ${ctx.tenantId}
        AND table_id = ${input.tableId}
        AND cleared_at IS NULL
      RETURNING id, table_id, seated_at, cleared_at, turn_time_minutes, party_size
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];

    if (!updated) {
      // No open turn entry found — no-op
      return { result: null, events: [] };
    }

    const event = buildEventFromContext(ctx, 'fnb.table.turn_completed.v1', {
      turnLogId: String(updated.id),
      tableId: String(updated.table_id),
      turnTimeMinutes: Number(updated.turn_time_minutes),
      partySize: Number(updated.party_size),
    });

    return {
      result: {
        id: String(updated.id),
        tableId: String(updated.table_id),
        seatedAt: String(updated.seated_at),
        clearedAt: String(updated.cleared_at),
        turnTimeMinutes: Number(updated.turn_time_minutes),
        partySize: Number(updated.party_size),
      },
      events: [event],
    };
  });
}
