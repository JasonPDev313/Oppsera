import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveServiceChargeInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function removeServiceCharge(ctx: RequestContext, orderId: string, input: RemoveServiceChargeInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'removeServiceCharge');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    const [charge] = await (tx as any).select().from(orderCharges)
      .where(and(eq(orderCharges.id, input.chargeId), eq(orderCharges.orderId, orderId)))
      .limit(1);

    if (!charge) {
      throw new NotFoundError('Service charge', input.chargeId);
    }

    await (tx as any).delete(orderCharges).where(eq(orderCharges.id, input.chargeId));

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

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'removeServiceCharge', { chargeId: input.chargeId });

    const event = buildEventFromContext(ctx, 'order.service_charge_removed.v1', {
      orderId,
      chargeId: input.chargeId,
      name: charge.name,
      amount: charge.amount,
    });

    return { result: { orderId, chargeId: input.chargeId }, events: [event] };
  });

  await auditLog(ctx, 'order.service_charge_removed', 'order', orderId);
  return result;
}
