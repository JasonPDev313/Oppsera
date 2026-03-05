import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders } from '@oppsera/db';
import { and, eq } from 'drizzle-orm';
import type { HoldOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function holdOrder(ctx: RequestContext, orderId: string, input: HoldOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'holdOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    const now = new Date();
    await tx.update(orders).set({
      heldAt: now,
      heldBy: ctx.user.id,
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await incrementVersion(tx, orderId, ctx.tenantId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'holdOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.held.v1', {
      orderId,
      orderNumber: order.orderNumber,
      heldBy: ctx.user.id,
    });

    return {
      result: { ...order, heldAt: now, heldBy: ctx.user.id, version: order.version + 1 },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'order.held', 'order', orderId);
  return result;
}
