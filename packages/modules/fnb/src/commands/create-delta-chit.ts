import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenDeltaChits, fnbKitchenTickets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateDeltaChitInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TicketNotFoundError } from '../errors';

export async function createDeltaChit(
  ctx: RequestContext,
  input: CreateDeltaChitInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createDeltaChit',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate ticket exists
    const [ticket] = await (tx as any)
      .select()
      .from(fnbKitchenTickets)
      .where(and(
        eq(fnbKitchenTickets.id, input.ticketId),
        eq(fnbKitchenTickets.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    const [created] = await (tx as any)
      .insert(fnbKitchenDeltaChits)
      .values({
        tenantId: ctx.tenantId,
        ticketId: input.ticketId,
        deltaType: input.deltaType,
        orderLineId: input.orderLineId,
        itemName: input.itemName,
        modifierSummary: input.modifierSummary ?? null,
        seatNumber: input.seatNumber ?? null,
        quantity: input.quantity != null ? String(input.quantity) : null,
        reason: input.reason ?? null,
        stationId: input.stationId ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.DELTA_CHIT_CREATED, {
      deltaChitId: created!.id,
      ticketId: input.ticketId,
      locationId: ticket.locationId,
      deltaType: input.deltaType,
      itemName: input.itemName,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createDeltaChit', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.delta_chit.created', 'fnb_kitchen_delta_chits', result.id, undefined, {
    ticketId: input.ticketId,
    deltaType: input.deltaType,
  });

  return result;
}
