import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { orders } from '@oppsera/db';
import type { UpdateOrderInput } from '../validation';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';

export async function updateOrder(ctx: RequestContext, orderId: string, input: UpdateOrderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: ctx.user.id };
    const changes: Record<string, unknown> = {};

    if (input.customerId !== undefined) {
      updates.customerId = input.customerId;
      changes.customerId = { from: order.customerId, to: input.customerId };
    }
    if (input.notes !== undefined) {
      updates.notes = input.notes;
      changes.notes = { from: order.notes, to: input.notes };
    }
    if (input.metadata !== undefined) {
      updates.metadata = input.metadata;
      changes.metadata = { from: order.metadata, to: input.metadata };
    }

    await tx.update(orders).set(updates).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));
    await incrementVersion(tx, orderId, ctx.tenantId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.updated.v1', {
      orderId,
      changes,
    });

    return { result: { orderId }, events: [event] };
  });

  auditLogDeferred(ctx, 'order.updated', 'order', orderId);
  return result;
}
