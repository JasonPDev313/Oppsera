import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { VoidOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function voidOrder(ctx: RequestContext, orderId: string, input: VoidOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, ['open', 'placed']);

    const now = new Date();
    await (tx as any).update(orders).set({
      status: 'voided',
      voidedAt: now,
      voidReason: input.reason,
      voidedBy: ctx.user.id,
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.voided.v1', {
      orderId,
      orderNumber: order.orderNumber,
      reason: input.reason,
      voidedBy: ctx.user.id,
    });

    return { result: { ...order, status: 'voided', voidedAt: now, voidReason: input.reason }, events: [event] };
  });

  await auditLog(ctx, 'order.voided', 'order', orderId);
  return result;
}
