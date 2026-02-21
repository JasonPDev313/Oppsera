import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { VoidTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketStatusConflictError, TicketVersionConflictError } from '../errors';

const VOIDABLE_STATUSES = ['pending', 'in_progress'];

export async function voidTicket(
  ctx: RequestContext,
  ticketId: string,
  input: VoidTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'voidTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(ticketId);

    if (!VOIDABLE_STATUSES.includes(ticket.status)) {
      throw new TicketStatusConflictError(ticketId, ticket.status, 'void');
    }

    if (input.expectedVersion !== undefined && ticket.version !== input.expectedVersion) {
      throw new TicketVersionConflictError(ticketId);
    }

    // Void the ticket
    const [updated] = await (tx as any)
      .update(fnbKitchenTickets)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        version: ticket.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(fnbKitchenTickets.id, ticketId))
      .returning();

    // Void all items
    await (tx as any)
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'voided',
        voidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fnbKitchenTicketItems.ticketId, ticketId));

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_VOIDED, {
      ticketId,
      locationId: ticket.locationId,
      tabId: ticket.tabId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidTicket', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.ticket.voided', 'fnb_kitchen_tickets', ticketId);
  return result;
}
