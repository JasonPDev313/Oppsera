import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Fetch all lines (need IDs for line-level updates), charges, discounts
    const [allLinesWithId, allCharges, allDiscounts] = await Promise.all([
      tx.select({
        id: orderLines.id,
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

    const allLines = allLinesWithId.map((l) => ({
      lineSubtotal: l.lineSubtotal,
      lineTax: l.lineTax,
      lineTotal: l.lineTotal,
    }));

    // Recalculate order-level totals — if tax exempt, zero out all taxes
    let totals;
    if (input.taxExempt) {
      const zeroTaxLines = allLines.map((l) => ({
        lineSubtotal: l.lineSubtotal,
        lineTax: 0,
        lineTotal: l.lineSubtotal,
      }));
      const zeroTaxCharges = allCharges.map((c) => ({
        amount: c.amount,
        taxAmount: 0,
      }));
      totals = recalculateOrderTotals(zeroTaxLines, zeroTaxCharges, allDiscounts);

      // Zero out each line's tax fields for consistency with order-level totals
      if (allLinesWithId.length > 0) {
        await tx.update(orderLines).set({
          lineTax: 0,
          lineTotal: sql`line_subtotal`,
        }).where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, ctx.tenantId)));
      }
    } else {
      // Restore original taxes from the orderLineTaxes breakdown rows
      // Sum tax amounts per line to restore lineTax, then lineTotal = lineSubtotal + lineTax
      const lineIds = allLinesWithId.map((l) => l.id);
      const taxSums = lineIds.length > 0
        ? await tx
            .select({
              orderLineId: orderLineTaxes.orderLineId,
              totalTax: sql<number>`coalesce(sum(${orderLineTaxes.amount}), 0)::int`,
            })
            .from(orderLineTaxes)
            .where(inArray(orderLineTaxes.orderLineId, lineIds))
            .groupBy(orderLineTaxes.orderLineId)
        : [];

      const taxByLineId = new Map(taxSums.map((t) => [t.orderLineId, t.totalTax]));

      // Update each line with restored tax values
      for (const line of allLinesWithId) {
        const restoredTax = taxByLineId.get(line.id) ?? 0;
        await tx.update(orderLines).set({
          lineTax: restoredTax,
          lineTotal: line.lineSubtotal + restoredTax,
        }).where(and(eq(orderLines.id, line.id), eq(orderLines.tenantId, ctx.tenantId)));
      }

      // Recalculate totals using restored per-line tax values
      const restoredLines = allLinesWithId.map((l) => {
        const restoredTax = taxByLineId.get(l.id) ?? 0;
        return {
          lineSubtotal: l.lineSubtotal,
          lineTax: restoredTax,
          lineTotal: l.lineSubtotal + restoredTax,
        };
      });
      totals = recalculateOrderTotals(restoredLines, allCharges, allDiscounts);
    }

    await tx.update(orders).set({
      taxExempt: input.taxExempt,
      taxExemptReason: input.taxExempt ? (input.taxExemptReason ?? null) : null,
      ...totals,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await incrementVersion(tx, orderId, ctx.tenantId);
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

  auditLogDeferred(ctx, 'order.tax_exempt_changed', 'order', orderId);
  return result;
}
