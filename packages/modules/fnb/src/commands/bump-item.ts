import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError, TicketItemStatusConflictError } from '../errors';

export async function bumpItem(
  ctx: RequestContext,
  input: BumpItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpItem',
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

    // Guard: only pending/cooking items can be bumped
    if (item.itemStatus === 'ready' || item.itemStatus === 'served' || item.itemStatus === 'voided') {
      throw new TicketItemStatusConflictError(input.ticketItemId, item.itemStatus, 'bump');
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      itemStatus: 'ready',
      readyAt: now,
      bumpedBy: ctx.user.id,
      updatedAt: now,
    };
    // Record startedAt on first interaction (item was pending, never started)
    if (!item.startedAt) {
      updateData.startedAt = now;
    }

    const [updated] = await tx
      .update(fnbKitchenTicketItems)
      .set(updateData)
      .where(and(
        eq(fnbKitchenTicketItems.id, input.ticketItemId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
      ))
      .returning();

    // Look up ticket for locationId
    const [ticket] = await tx
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, item.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_BUMPED, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId: ticket?.locationId ?? ctx.locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bumpItem', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.item_bumped', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
