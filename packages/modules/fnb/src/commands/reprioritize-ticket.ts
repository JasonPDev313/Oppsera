import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { ReprioritizeTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

/**
 * Change a kitchen ticket's priority level.
 * Higher priority = displayed first on KDS (ORDER BY priority_level DESC).
 */
export async function reprioritizeTicket(
  ctx: RequestContext,
  input: ReprioritizeTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'reprioritizeTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
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

    if (ctx.locationId && ticket.locationId && ticket.locationId !== ctx.locationId) {
      throw new TicketNotFoundError(input.ticketId);
    }

    if (ticket.status === 'served' || ticket.status === 'voided') {
      throw new TicketStatusConflictError(input.ticketId, ticket.status, 'reprioritize');
    }

    // No-op if priority is already the same
    if (Number(ticket.priorityLevel) === input.priorityLevel) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reprioritizeTicket', ticket);
      return { result: ticket, events: [] };
    }

    const now = new Date();
    const oldPriority = Number(ticket.priorityLevel);

    const [updated] = await tx
      .update(fnbKitchenTickets)
      .set({
        priorityLevel: input.priorityLevel,
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

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_REPRIORITIZED, {
      ticketId: input.ticketId,
      locationId: ticket.locationId,
      oldPriority,
      newPriority: input.priorityLevel,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reprioritizeTicket', updated);

    return { result: updated!, events: [event] };
  });

  logger.info('[kds] ticket reprioritized', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, priorityLevel: input.priorityLevel, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.ticket_reprioritized', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
