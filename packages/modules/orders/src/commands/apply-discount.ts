import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { and, eq } from 'drizzle-orm';
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
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    let amount: number;
    if (input.type === 'percentage') {
      amount = Math.round(order.subtotal * input.value / 100);
    } else {
      // value is already in cents (POS frontend converts dollars→cents before sending)
      amount = Math.round(input.value);
    }

    const [discount] = await tx.insert(orderDiscounts).values({
      tenantId: ctx.tenantId,
      orderId,
      type: input.type,
      value: input.value, // raw value: cents for fixed, percent for percentage; `amount` holds computed cents
      amount,
      reason: input.reason ?? null,
      discountClassification: input.discountClassification ?? 'manual_discount',
      createdBy: ctx.user.id,
    }).returning();

    // Recalculate totals
    const [allLines, allCharges, allDiscounts] = await Promise.all([
      tx.select({
        lineSubtotal: orderLines.lineSubtotal,
        lineTax: orderLines.lineTax,
        lineTotal: orderLines.lineTotal,
      }).from(orderLines).where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, ctx.tenantId))),
      tx.select({
        amount: orderCharges.amount,
        taxAmount: orderCharges.taxAmount,
      }).from(orderCharges).where(and(eq(orderCharges.orderId, orderId), eq(orderCharges.tenantId, ctx.tenantId))),
      tx.select({
        amount: orderDiscounts.amount,
      }).from(orderDiscounts).where(and(eq(orderDiscounts.orderId, orderId), eq(orderDiscounts.tenantId, ctx.tenantId))),
    ]);

    const totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);

    await tx.update(orders).set({
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await incrementVersion(tx, orderId, ctx.tenantId);

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

  auditLogDeferred(ctx, 'order.discount_applied', 'order', orderId);
  return result;
}
