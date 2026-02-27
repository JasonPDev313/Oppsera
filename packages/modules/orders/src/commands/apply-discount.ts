import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { ApplyDiscountInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function applyDiscount(ctx: RequestContext, orderId: string, input: ApplyDiscountInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'applyDiscount');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    let amount: number;
    if (input.type === 'percentage') {
      amount = Math.round(order.subtotal * input.value / 100);
    } else {
      amount = Math.round(input.value * 100); // convert dollars to cents
    }

    const [discount] = await (tx as any).insert(orderDiscounts).values({
      tenantId: ctx.tenantId,
      orderId,
      type: input.type,
      value: input.type === 'fixed' ? Math.round(input.value * 100) : input.value,
      amount,
      reason: input.reason ?? null,
      discountClassification: input.discountClassification ?? 'manual_discount',
      createdBy: ctx.user.id,
    }).returning();

    // Recalculate totals
    const [allLines, allCharges, allDiscounts] = await Promise.all([
      (tx as any).select({
        lineSubtotal: orderLines.lineSubtotal,
        lineTax: orderLines.lineTax,
        lineTotal: orderLines.lineTotal,
      }).from(orderLines).where(eq(orderLines.orderId, orderId)),
      (tx as any).select({
        amount: orderCharges.amount,
        taxAmount: orderCharges.taxAmount,
      }).from(orderCharges).where(eq(orderCharges.orderId, orderId)),
      (tx as any).select({
        amount: orderDiscounts.amount,
      }).from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
    ]);

    const totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);

    await (tx as any).update(orders).set({
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'applyDiscount', { discountId: discount!.id });

    const event = buildEventFromContext(ctx, 'order.discount_applied.v1', {
      orderId,
      discountId: discount!.id,
      type: input.type,
      value: input.value,
      amount,
      discountClassification: input.discountClassification ?? 'manual_discount',
    });

    return { result: discount!, events: [event] };
  });

  await auditLog(ctx, 'order.discount_applied', 'order', orderId);
  return result;
}
