import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RecallItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketItemNotFoundError } from '../errors';

export async function recallItem(
  ctx: RequestContext,
  input: RecallItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'recallItem',
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

    // Un-bump: set back to cooking, clear bump attribution
    const [updated] = await (tx as any)
      .update(fnbKitchenTicketItems)
      .set({
        itemStatus: 'cooking',
        readyAt: null,
        servedAt: null,
        bumpedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(fnbKitchenTicketItems.id, input.ticketItemId))
      .returning();

    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(eq(fnbKitchenTickets.id, item.ticketId))
      .limit(1);

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_RECALLED, {
      ticketItemId: input.ticketItemId,
      ticketId: item.ticketId,
      stationId: input.stationId,
      locationId: ticket?.locationId ?? ctx.locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallItem', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.item_recalled', 'fnb_kitchen_ticket_items', input.ticketItemId);
  return result;
}
