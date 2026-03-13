import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTicketItemStatusInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError } from '../errors';
import { ConflictError } from '@oppsera/shared';

const VALID_ITEM_TRANSITIONS: Record<string, string[]> = {
  pending: ['cooking', 'ready', 'voided'],
  cooking: ['ready', 'voided'],
  ready: ['served', 'voided'],
  served: [],
  voided: [],
};

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
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [item] = await tx
      .select()
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.id, itemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!item) throw new TicketItemNotFoundError(itemId);

    const allowedNext = VALID_ITEM_TRANSITIONS[item.itemStatus] ?? [];
    if (!allowedNext.includes(input.itemStatus)) {
      throw new ConflictError(
        `Cannot transition item from '${item.itemStatus}' to '${input.itemStatus}'`,
      );
    }

    const setFields: Record<string, unknown> = {
      itemStatus: input.itemStatus,
      updatedAt: new Date(),
    };

    if (input.itemStatus === 'cooking') setFields.startedAt = new Date();
    if (input.itemStatus === 'ready') setFields.readyAt = new Date();
    if (input.itemStatus === 'served') setFields.servedAt = new Date();
    if (input.itemStatus === 'voided') setFields.voidedAt = new Date();

    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set(setFields)
      .where(and(
        eq(fnbKitchenTicketItems.id, itemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .returning();

    // Look up the ticket for locationId
    const [ticket] = await tx
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

  auditLogDeferred(ctx, 'fnb.ticket_item.status_changed', 'fnb_kitchen_ticket_items', itemId);
  return result;
}
