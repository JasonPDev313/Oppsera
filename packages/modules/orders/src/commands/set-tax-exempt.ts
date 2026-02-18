import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { SetTaxExemptInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function setTaxExempt(ctx: RequestContext, orderId: string, input: SetTaxExemptInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'setTaxExempt');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Get all lines, charges, discounts
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

    // Recalculate totals — if tax exempt, zero out all taxes
    let totals;
    if (input.taxExempt) {
      const zeroTaxLines = allLines.map((l: any) => ({
        lineSubtotal: l.lineSubtotal,
        lineTax: 0,
        lineTotal: l.lineSubtotal,
      }));
      const zeroTaxCharges = allCharges.map((c: any) => ({
        amount: c.amount,
        taxAmount: 0,
      }));
      totals = recalculateOrderTotals(zeroTaxLines, zeroTaxCharges, allDiscounts);
    } else {
      // Restore original taxes
      totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);
    }

    await (tx as any).update(orders).set({
      taxExempt: input.taxExempt,
      taxExemptReason: input.taxExempt ? (input.taxExemptReason ?? null) : null,
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'setTaxExempt', { taxExempt: input.taxExempt });

    const event = buildEventFromContext(ctx, 'order.tax_exempt_changed.v1', {
      orderId,
      taxExempt: input.taxExempt,
      taxExemptReason: input.taxExemptReason ?? null,
    });

    return {
      result: {
        ...order,
        taxExempt: input.taxExempt,
        taxExemptReason: input.taxExempt ? (input.taxExemptReason ?? null) : null,
        ...totals,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'order.tax_exempt_changed', 'order', orderId);
  return result;
}
