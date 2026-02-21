import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CallBackToStationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError } from '../errors';

export async function callBackToStation(
  ctx: RequestContext,
  input: CallBackToStationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'callBackToStation',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [item] = await (tx as any)
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(input.ticketItemId);

    // Send item back to station for rework
    const [updated] = await (tx as any)
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'cooking',
        stationId: input.stationId,
        readyAt: null,
        servedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fnbKitchenTicketItems.id, input.ticketItemId))
      .returning();

    // If ticket was served, move back to in_progress
    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(eq(fnbKitchenTickets.id, item.ticketId))
      .limit(1);

    if (ticket && (ticket.status === 'served' || ticket.status === 'ready')) {
      await (tx as any)
        .update(fnbKitchenTickets)
        .set({
          status: 'in_progress',
          servedAt: null,
          readyAt: null,
          version: ticket.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(fnbKitchenTickets.id, item.ticketId));
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_CALLED_BACK, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId: ticket?.locationId ?? ctx.locationId,
      reason: input.reason ?? null,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'callBackToStation', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.item_called_back', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
