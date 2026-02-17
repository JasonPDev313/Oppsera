import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ConflictError } from '@oppsera/shared';
import { orders } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { RecallOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function recallOrder(ctx: RequestContext, orderId: string, input: RecallOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'recallOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    if (!order.heldAt) {
      throw new ConflictError('Order is not held');
    }

    const now = new Date();
    await (tx as any).update(orders).set({
      heldAt: null,
      heldBy: null,
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recallOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.recalled.v1', {
      orderId,
      orderNumber: order.orderNumber,
      recalledBy: ctx.user.id,
    });

    return {
      result: { ...order, heldAt: null, heldBy: null, version: order.version + 1 },
      events: [event],
    };
  });

  await auditLog(ctx, 'order.recalled', 'order', orderId);
  return result;
}
