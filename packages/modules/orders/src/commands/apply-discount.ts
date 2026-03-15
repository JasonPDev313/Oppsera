import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderDiscounts, orderLines } from '@oppsera/db';
import { and, eq, sql } from 'drizzle-orm';
import type { ApplyDiscountInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation } from '../helpers/optimistic-lock';
import { recalculateOrderTaxesAfterDiscount } from '../helpers/recalculate-tax-after-discount';

export async function applyDiscount(ctx: RequestContext, orderId: string, input: ApplyDiscountInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'applyDiscount');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // For percentage discounts, compute on live SUM(lineSubtotal) inside the
    // transaction — not stale order.subtotal — to handle concurrent line adds.
    let amount: number;
    if (input.type === 'percentage') {
      const lineRows = await tx.select({ lineSubtotal: orderLines.lineSubtotal })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, ctx.tenantId)));
      const liveSubtotal = lineRows.reduce((s: number, r: { lineSubtotal: number }) => s + r.lineSubtotal, 0);
      amount = Math.round(liveSubtotal * input.value / 100);
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

    // Prorate discount across lines and recalculate per-line tax on discounted amounts.
    // This ensures tax is computed on the post-discount taxable base (required for
    // correct tax collection in most US/CA jurisdictions).
    const totals = await recalculateOrderTaxesAfterDiscount(tx, ctx.tenantId, orderId);

    // Combined UPDATE: set totals + increment version in a single DB round-trip
    await tx.update(orders).set({
      ...totals,
      version: sql`version + 1`,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'applyDiscount', { discountId: discount!.id });

    const event = buildEventFromContext(ctx, 'order.discount_applied.v1', {
      orderId,
      discountId: discount!.id,
      type: input.type,
      value: input.value,
      amount,
      taxAdjustment: order.taxTotal - totals.taxTotal, // positive = tax reduced
      discountClassification: input.discountClassification ?? 'manual_discount',
    });

    return { result: discount!, events: [event] };
  });

  auditLogDeferred(ctx, 'order.discount_applied', 'order', orderId);
  return result;
}
