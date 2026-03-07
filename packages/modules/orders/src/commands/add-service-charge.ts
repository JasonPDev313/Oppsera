import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { and, eq } from 'drizzle-orm';
import type { AddServiceChargeInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function addServiceCharge(ctx: RequestContext, orderId: string, input: AddServiceChargeInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'addServiceCharge');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Calculate amount based on calculation type
    // Order of operations: service charge applies AFTER discounts
    const discountedSubtotal = order.subtotal - order.discountTotal;
    let amount: number;
    if (input.calculationType === 'percentage') {
      amount = Math.round(discountedSubtotal * input.value / 100);
    } else {
      amount = input.value; // fixed amount in cents
    }

    const [charge] = await tx.insert(orderCharges).values({
      tenantId: ctx.tenantId,
      orderId,
      chargeType: input.chargeType,
      name: input.name,
      calculationType: input.calculationType,
      value: input.value,
      amount,
      isTaxable: input.isTaxable ?? false,
      taxAmount: 0,
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

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addServiceCharge', { chargeId: charge!.id });

    const event = buildEventFromContext(ctx, 'order.service_charge_added.v1', {
      orderId,
      chargeId: charge!.id,
      chargeType: input.chargeType,
      name: input.name,
      amount,
    });

    return { result: charge!, events: [event] };
  });

  auditLogDeferred(ctx, 'order.service_charge_added', 'order', orderId);
  return result;
}
