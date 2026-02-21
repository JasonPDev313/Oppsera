import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTicketItemStatusInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError } from '../errors';

export async function updateTicketItemStatus(
  ctx: RequestContext,
  itemId: string,
  input: UpdateTicketItemStatusInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateTicketItemStatus',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [item] = await (tx as any)
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, itemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(itemId);

    const setFields: Record<string, unknown> = {
      itemStatus: input.itemStatus,
      updatedAt: new Date(),
    };

    if (input.itemStatus === 'cooking') setFields.startedAt = new Date();
    if (input.itemStatus === 'ready') setFields.readyAt = new Date();
    if (input.itemStatus === 'served') setFields.servedAt = new Date();
    if (input.itemStatus === 'voided') setFields.voidedAt = new Date();

    const [updated] = await (tx as any)
      .update(fnbKitchenTicketItems)
      .set(setFields)
      .where(eq(fnbKitchenTicketItems.id, itemId))
      .returning();

    // Look up the ticket for locationId
    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(eq(fnbKitchenTickets.id, item.ticketId))
      .limit(1);

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_ITEM_STATUS_CHANGED, {
      ticketItemId: itemId,
      ticketId: item.ticketId,
      locationId: ticket?.locationId ?? ctx.locationId,
      oldStatus: item.itemStatus,
      newStatus: input.itemStatus,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTicketItemStatus', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.ticket_item.status_changed', 'fnb_kitchen_ticket_items', itemId);
  return result;
}
