import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
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
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Find the line
    const [line] = await (tx as any).select().from(orderLines)
      .where(and(eq(orderLines.id, input.lineItemId), eq(orderLines.orderId, orderId)))
      .limit(1);

    if (!line) {
      throw new NotFoundError('Order line', input.lineItemId);
    }

    // Delete tax rows for this line
    await (tx as any).delete(orderLineTaxes).where(eq(orderLineTaxes.orderLineId, input.lineItemId));

    // Delete the line
    await (tx as any).delete(orderLines).where(eq(orderLines.id, input.lineItemId));

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

  await auditLog(ctx, 'order.line_removed', 'order', orderId);
  return result;
}
