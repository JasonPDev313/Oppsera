import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketNotReadyError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

export async function bumpTicket(
  ctx: RequestContext,
  input: BumpTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    // Guard: cannot bump an already-served or voided ticket
    if (ticket.status === 'served' || ticket.status === 'voided') {
      throw new TicketStatusConflictError(input.ticketId, ticket.status, 'bump');
    }

    // Verify all non-voided items are ready, and at least one non-voided item exists
    const allItems = await tx
      .select({ itemStatus: fnbKitchenTicketItems.itemStatus })
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ));

    const nonVoided = allItems.filter((i) => i.itemStatus !== 'voided');
    if (nonVoided.length === 0) {
      throw new TicketNotReadyError(input.ticketId);
    }
    const notReady = nonVoided.filter((i) => i.itemStatus !== 'ready' && i.itemStatus !== 'served');
    if (notReady.length > 0) {
      throw new TicketNotReadyError(input.ticketId);
    }

    // Bump ticket to served (with optimistic lock)
    const now = new Date();
    const [updated] = await tx
      .update(fnbKitchenTickets)
      .set({
        status: 'served',
        servedAt: now,
        bumpedBy: ctx.user.id,
        version: ticket.version + 1,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
        eq(fnbKitchenTickets.version, ticket.version),
      ))
      .returning();
    if (!updated) throw new TicketVersionConflictError(input.ticketId);

    // Mark all ready items as served
    await tx
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'served',
        servedAt: now,
        bumpedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        eq(fnbKitchenTicketItems.itemStatus, 'ready'),
      ));

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_BUMPED, {
      ticketId: input.ticketId,
      locationId: ticket.locationId,
      tabId: ticket.tabId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bumpTicket', updated);

    return { result: updated!, events: [event] };
  });

  logger.info('[kds] ticket bumped to served', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.ticket_bumped', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
