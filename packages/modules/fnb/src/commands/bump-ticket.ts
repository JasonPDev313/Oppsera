import { eq, and, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError, TicketNotReadyError } from '../errors';

export async function bumpTicket(
  ctx: RequestContext,
  input: BumpTicketInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    // Verify all non-voided items are ready
    const notReadyItems = await (tx as any)
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
        ne(fnbKitchenTicketItems.itemStatus, 'ready'),
        ne(fnbKitchenTicketItems.itemStatus, 'served'),
        ne(fnbKitchenTicketItems.itemStatus, 'voided'),
      ))
      .limit(1);

    if (notReadyItems.length > 0) {
      throw new TicketNotReadyError(input.ticketId);
    }

    // Bump ticket to served
    const now = new Date();
    const [updated] = await (tx as any)
      .update(fnbKitchenTickets)
      .set({
        status: 'served',
        servedAt: now,
        bumpedBy: ctx.user.id,
        version: ticket.version + 1,
        updatedAt: now,
      })
      .where(eq(fnbKitchenTickets.id, input.ticketId))
      .returning();

    // Mark all ready items as served
    await (tx as any)
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'served',
        servedAt: now,
        bumpedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.ticketId, input.ticketId),
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

  await auditLog(ctx, 'fnb.kds.ticket_bumped', 'fnb_kitchen_tickets', input.ticketId);
  return result;
}
