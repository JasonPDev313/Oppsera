import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { logger } from '@oppsera/core/observability';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BulkHoldTicketsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export interface BulkHoldResult {
  succeeded: number;
  skipped: number;
  ticketIds: string[];
}

/**
 * Bulk hold or unhold (fire) multiple kitchen tickets in a single transaction.
 * Skips tickets that are already in the desired state or are terminal (served/voided).
 */
export async function bulkHoldTickets(
  ctx: RequestContext,
  input: BulkHoldTicketsInput,
): Promise<BulkHoldResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const now = new Date();
    const holdFields = input.hold
      ? sql`is_held = true, held_at = ${now.toISOString()}::timestamptz`
      : sql`is_held = false, fired_at = ${now.toISOString()}::timestamptz, fired_by = ${ctx.user.id}`;

    const ids = input.ticketIds;
    const updatedRows = await tx.execute(
      sql`UPDATE fnb_kitchen_tickets
          SET ${holdFields},
              version = version + 1,
              updated_at = ${now.toISOString()}::timestamptz
          WHERE tenant_id = ${ctx.tenantId}
            AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
            AND status NOT IN ('served', 'voided')
            AND is_held = ${!input.hold}
            ${ctx.locationId ? sql`AND location_id = ${ctx.locationId}` : sql``}
          RETURNING id, location_id`,
    );
    const updated = Array.from(updatedRows as Iterable<Record<string, unknown>>);
    const updatedIds = updated.map((r) => r.id as string);

    const events = updated.map((r) => {
      const ticketId = r.id as string;
      const locationId = (r.location_id as string) ?? ctx.locationId;
      return buildEventFromContext(
        ctx,
        input.hold ? FNB_EVENTS.TICKET_HELD : FNB_EVENTS.TICKET_UNHELD,
        input.hold
          ? { ticketId, locationId }
          : { ticketId, locationId, firedBy: ctx.user.id },
      );
    });

    return {
      result: {
        succeeded: updatedIds.length,
        skipped: ids.length - updatedIds.length,
        ticketIds: updatedIds,
      },
      events,
    };
  });

  const action = input.hold ? 'held' : 'unheld (fired)';
  logger.info(`[kds] bulk tickets ${action}`, {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    count: result.succeeded, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, input.hold ? 'fnb.kds.bulk_tickets_held' : 'fnb.kds.bulk_tickets_unheld', 'fnb_kitchen_tickets', input.ticketIds.join(','));
  return result;
}
