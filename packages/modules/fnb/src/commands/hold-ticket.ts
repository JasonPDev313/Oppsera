import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { HoldTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

/**
 * Hold or unhold (fire) a kitchen ticket.
 *
 * Held tickets are blocked from auto-bump (Mode B) and visually flagged on KDS.
 * Unholding ("firing") clears the hold and allows normal bump flow to resume.
 */
export async function holdTicket(
  ctx: RequestContext,
  input: HoldTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'holdTicket',
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

    // Defense-in-depth: reject if ticket belongs to a different location
    if (ctx.locationId && ticket.locationId && ticket.locationId !== ctx.locationId) {
      throw new TicketNotFoundError(input.ticketId);
    }

    // Guard: cannot hold/unhold terminal tickets
    if (ticket.status === 'served' || ticket.status === 'voided') {
      throw new TicketStatusConflictError(input.ticketId, ticket.status, input.hold ? 'hold' : 'unhold');
    }

    // Guard: no-op if already in the desired state
    if (ticket.isHeld === input.hold) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'holdTicket', ticket);
      return { result: ticket, events: [] };
    }

    const now = new Date();
    const setData: Record<string, unknown> = {
      isHeld: input.hold,
      version: ticket.version + 1,
      updatedAt: now,
    };

    if (input.hold) {
      setData.heldAt = now;
    } else {
      // Unhold = "fire" the ticket
      setData.firedAt = now;
      setData.firedBy = ctx.user.id;
    }

    const [updated] = await tx
      .update(fnbKitchenTickets)
      .set(setData)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
        eq(fnbKitchenTickets.version, ticket.version),
      ))
      .returning();
    if (!updated) throw new TicketVersionConflictError(input.ticketId);

    const event = input.hold
      ? buildEventFromContext(ctx, FNB_EVENTS.TICKET_HELD, {
          ticketId: input.ticketId,
          locationId: ticket.locationId,
        })
      : buildEventFromContext(ctx, FNB_EVENTS.TICKET_UNHELD, {
          ticketId: input.ticketId,
          locationId: ticket.locationId,
          firedBy: ctx.user.id,
        });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'holdTicket', updated);

    return { result: updated!, events: [event] };
  });

  const action = input.hold ? 'held' : 'unheld (fired)';
  logger.info(`[kds] ticket ${action}`, {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, input.hold ? 'fnb.kds.ticket_held' : 'fnb.kds.ticket_unheld', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
