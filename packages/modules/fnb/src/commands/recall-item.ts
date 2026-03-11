import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RecallItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError, TicketItemStatusConflictError, TicketVersionConflictError } from '../errors';

export async function recallItem(
  ctx: RequestContext,
  input: RecallItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'recallItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [item] = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(input.ticketItemId);

    // Defense-in-depth: verify item's ticket belongs to caller's location
    if (ctx.locationId) {
      const [parentTicket] = await tx
        .select({ locationId: fnbKitchenTickets.locationId })
        .from(fnbKitchenTickets)
        .where(and(
          eq(fnbKitchenTickets.id, item.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
        ))
        .limit(1);
      if (parentTicket && parentTicket.locationId !== ctx.locationId) {
        throw new TicketItemNotFoundError(input.ticketItemId);
      }
    }

    // Guard: only ready/served items can be recalled
    if (item.itemStatus !== 'ready' && item.itemStatus !== 'served') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'recall');
    }

    // Un-bump: set back to cooking, clear bump attribution and timestamps
    const now = new Date();
    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'cooking',
        readyAt: null,
        servedAt: null,
        startedAt: null,
        bumpedBy: null,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        eq(fnbKitchenTicketItems.itemStatus, item.itemStatus),
      ))
      .returning();
    if (!updated) {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'recall (concurrent)');
    }

    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);

    // Revert ticket status if it was served/ready (an item was pulled back)
    if (ticket && (ticket.status === 'served' || ticket.status === 'ready')) {
      const [reverted] = await tx
        .update(fnbKitchenTickets)
        .set({
          status: 'in_progress',
          servedAt: null,
          readyAt: null,
          version: ticket.version + 1,
          updatedAt: now,
        })
        .where(and(
          eq(fnbKitchenTickets.id, item.ticketId),
          eq(fnbKitchenTickets.tenantId, ctx.tenantId),
          eq(fnbKitchenTickets.version, ticket.version),
        ))
        .returning();
      if (!reverted) throw new TicketVersionConflictError(item.ticketId);
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_RECALLED, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId: ticket?.locationId ?? ctx.locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallItem', updated);

    return { result: updated!, events: [event] };
  });

  logger.info('[kds] item recalled to cooking', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketItemId: input.ticketItemId, stationId: input.stationId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.item_recalled', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
