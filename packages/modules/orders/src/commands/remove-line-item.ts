import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveLineItemInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function removeLineItem(ctx: RequestContext, orderId: string, input: RemoveLineItemInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'removeLineItem');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Find the line
    const [line] = await tx.select().from(orderLines)
      .where(and(eq(orderLines.id, input.lineItemId), eq(orderLines.orderId, orderId)))
      .limit(1);

    if (!line) {
      throw new NotFoundError('Order line', input.lineItemId);
    }

    // Delete tax rows for this line
    await tx.delete(orderLineTaxes).where(and(eq(orderLineTaxes.orderLineId, input.lineItemId), eq(orderLineTaxes.tenantId, ctx.tenantId)));

    // Delete the line
    await tx.delete(orderLines).where(and(eq(orderLines.id, input.lineItemId), eq(orderLines.tenantId, ctx.tenantId)));

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

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'removeLineItem', { lineId: input.lineItemId });

    const event = buildEventFromContext(ctx, 'order.line_removed.v1', {
      orderId,
      lineId: input.lineItemId,
      catalogItemId: line.catalogItemId,
      catalogItemName: line.catalogItemName,
      qty: Number(line.qty),
    });

    return { result: { orderId, lineId: input.lineItemId }, events: [event] };
  });

  auditLogDeferred(ctx, 'order.line_removed', 'order', orderId);
  return result;
}
