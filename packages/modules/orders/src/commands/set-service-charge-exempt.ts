import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { and, eq } from 'drizzle-orm';
import type { SetServiceChargeExemptInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function setServiceChargeExempt(
  ctx: RequestContext,
  orderId: string,
  input: SetServiceChargeExemptInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'setServiceChargeExempt',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    if (input.serviceChargeExempt) {
      // Remove all service charges when exempt
      await tx.delete(orderCharges)
        .where(eq(orderCharges.orderId, orderId));
    }

    // Recalculate order totals after service charge lines may have changed
    const [allLines, allCharges, allDiscounts] = await Promise.all([
      tx.select({
        lineSubtotal: orderLines.lineSubtotal,
        lineTax: orderLines.lineTax,
        lineTotal: orderLines.lineTotal,
      }).from(orderLines).where(eq(orderLines.orderId, orderId)),
      tx.select({
        amount: orderCharges.amount,
        taxAmount: orderCharges.taxAmount,
      }).from(orderCharges).where(eq(orderCharges.orderId, orderId)),
      tx.select({
        amount: orderDiscounts.amount,
      }).from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
    ]);

    const totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);

    await tx.update(orders).set({
      serviceChargeExempt: input.serviceChargeExempt,
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await incrementVersion(tx, orderId, ctx.tenantId);
    await saveIdempotencyKey(
      tx, ctx.tenantId, input.clientRequestId, 'setServiceChargeExempt',
      { serviceChargeExempt: input.serviceChargeExempt },
    );

    const event = buildEventFromContext(ctx, 'order.service_charge_exempt_changed.v1', {
      orderId,
      serviceChargeExempt: input.serviceChargeExempt,
    });

    return {
      result: {
        ...order,
        serviceChargeExempt: input.serviceChargeExempt,
        ...totals,
      },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'order.service_charge_exempt_changed', 'order', orderId);
  return result;
}
