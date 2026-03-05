import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CallBackToStationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError, TicketItemStatusConflictError, TicketVersionConflictError } from '../errors';

export async function callBackToStation(
  ctx: RequestContext,
  input: CallBackToStationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'callBackToStation',
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

    // Guard: only ready/served/cooking items can be called back — not voided or pending
    if (item.itemStatus === 'voided' || item.itemStatus === 'pending') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'call back');
    }

    // Send item back to station for rework
    const now = new Date();
    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'cooking',
        stationId: input.stationId,
        readyAt: null,
        servedAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .returning();

    // If ticket was served, move back to in_progress (with optimistic lock)
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);

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

  auditLogDeferred(ctx, 'fnb.kds.item_called_back', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
