import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BumpItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError } from '../errors';

export async function bumpItem(
  ctx: RequestContext,
  input: BumpItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bumpItem',
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

    const [updated] = await (tx as any)
      .update(fnbKitchenTicketItems)
      .set(updateData)
      .where(eq(fnbKitchenTicketItems.id, input.ticketItemId))
      .returning();

    // Look up ticket for locationId
    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(eq(fnbKitchenTickets.id, item.ticketId))
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
