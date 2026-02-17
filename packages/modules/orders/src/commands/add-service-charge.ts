import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { eq } from 'drizzle-orm';
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
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Calculate amount based on calculation type
    let amount: number;
    if (input.calculationType === 'percentage') {
      amount = Math.round(order.subtotal * input.value / 10000); // value is basis points
    } else {
      amount = input.value; // fixed amount in cents
    }

    const [charge] = await (tx as any).insert(orderCharges).values({
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
    const allLines = await (tx as any).select({
      lineSubtotal: orderLines.lineSubtotal,
      lineTax: orderLines.lineTax,
      lineTotal: orderLines.lineTotal,
    }).from(orderLines).where(eq(orderLines.orderId, orderId));

    const allCharges = await (tx as any).select({
      amount: orderCharges.amount,
      taxAmount: orderCharges.taxAmount,
    }).from(orderCharges).where(eq(orderCharges.orderId, orderId));

    const allDiscounts = await (tx as any).select({
      amount: orderDiscounts.amount,
    }).from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId));

    const totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);

    await (tx as any).update(orders).set({
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);

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

  await auditLog(ctx, 'order.service_charge_added', 'order', orderId);
  return result;
}
