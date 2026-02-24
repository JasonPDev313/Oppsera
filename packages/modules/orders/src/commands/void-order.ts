import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines } from '@oppsera/db';
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

    // Fetch order lines for modifier void tracking
    const lines = await (tx as any).select().from(orderLines).where(eq(orderLines.orderId, orderId));

    const event = buildEventFromContext(ctx, 'order.voided.v1', {
      orderId,
      orderNumber: order.orderNumber,
      reason: input.reason,
      voidedBy: ctx.user.id,
      locationId: order.locationId,
      businessDate: order.businessDate,
      total: order.total,
      customerId: order.customerId ?? null,
      lines: lines.map((l: any) => ({
        catalogItemId: l.catalogItemId,
        qty: Number(l.qty),
        modifiers: (l.modifiers ?? []).map((m: any) => ({
          modifierId: m.modifierId,
          modifierGroupId: m.modifierGroupId ?? null,
          name: m.name,
          priceAdjustmentCents: m.priceAdjustment ?? 0,
        })),
      })),
    });

    return { result: { ...order, status: 'voided', voidedAt: now, voidReason: input.reason, version: order.version + 1 }, events: [event] };
  });

  await auditLog(ctx, 'order.voided', 'order', orderId);
  return result;
}
