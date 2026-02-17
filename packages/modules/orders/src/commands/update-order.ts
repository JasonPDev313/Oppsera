import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { orders } from '@oppsera/db';
import type { UpdateOrderInput } from '../validation';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';

export async function updateOrder(ctx: RequestContext, orderId: string, input: UpdateOrderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateOrder');
      if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    }

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

    await (tx as any).update(orders).set(updates).where(eq(orders.id, orderId));
    await incrementVersion(tx, orderId);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateOrder', { orderId });
    }

    const event = buildEventFromContext(ctx, 'order.updated.v1', {
      orderId,
      changes,
    });

    return { result: { orderId }, events: [event] };
  });

  await auditLog(ctx, 'order.updated', 'order', orderId);
  return result;
}
