import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes, locations, taxGroupRates, taxRates } from '@oppsera/db';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';
import type { AddServiceChargeInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';
import { recalculateOrderTaxesAfterDiscount } from '../helpers/recalculate-tax-after-discount';

/**
 * Resolve unique tax rates for service charge taxation.
 *
 * Priority:
 * 1. Rates from the order's existing line items (most common case)
 * 2. Fallback: location's default_tax_group_id rates (for orders with no taxable items)
 */
async function resolveServiceChargeTaxRates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle tx type
  tx: any,
  tenantId: string,
  orderId: string,
  locationId: string,
): Promise<Array<{ taxRateId: string | null; taxName: string; rateDecimal: number }>> {
  // Try order line rates first
  const orderTaxRows = await tx.select({
    taxRateId: orderLineTaxes.taxRateId,
    taxName: orderLineTaxes.taxName,
    rateDecimal: orderLineTaxes.rateDecimal,
  }).from(orderLineTaxes)
    .innerJoin(orderLines, and(
      eq(orderLineTaxes.orderLineId, orderLines.id),
      eq(orderLineTaxes.tenantId, orderLines.tenantId),
    ))
    .where(and(
      eq(orderLines.orderId, orderId),
      eq(orderLines.tenantId, tenantId),
    ));

  // Deduplicate by taxRateId + rateDecimal composite key to avoid dropping
  // distinct rates that happen to share the same display name
  const seenKeys = new Set<string>();
  const uniqueRates: Array<{ taxRateId: string | null; taxName: string; rateDecimal: number }> = [];

  for (const row of orderTaxRows) {
    const rate = Number(row.rateDecimal) || 0;
    const key = `${row.taxRateId ?? ''}:${rate}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRates.push({
        taxRateId: row.taxRateId,
        taxName: row.taxName,
        rateDecimal: rate,
      });
    }
  }

  if (uniqueRates.length > 0) return uniqueRates;

  // Fallback: location's default tax group
  const [loc] = await tx.select({ defaultTaxGroupId: locations.defaultTaxGroupId })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)));

  if (!loc?.defaultTaxGroupId) return [];

  // Resolve rates from the default tax group
  const groupRateRows = await tx.select({ taxRateId: taxGroupRates.taxRateId })
    .from(taxGroupRates)
    .where(eq(taxGroupRates.taxGroupId, loc.defaultTaxGroupId));

  if (groupRateRows.length === 0) return [];

  const rateIds = Array.from(new Set(groupRateRows.map((r: { taxRateId: string }) => r.taxRateId))) as string[];
  const rateRows = await tx.select({
    id: taxRates.id,
    name: taxRates.name,
    rateDecimal: taxRates.rateDecimal,
  }).from(taxRates)
    .where(and(inArray(taxRates.id, rateIds), eq(taxRates.isActive, true)));

  return rateRows.map((r: { id: string; name: string; rateDecimal: string }) => ({
    taxRateId: r.id,
    taxName: r.name,
    rateDecimal: Number(r.rateDecimal),
  }));
}

export async function addServiceCharge(ctx: RequestContext, orderId: string, input: AddServiceChargeInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'addServiceCharge');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    const _order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Calculate amount based on calculation type.
    // For percentage charges, compute on live SUM(finalLineSubtotal) — not stale order.subtotal —
    // because finalized values reflect the post-discount base (correct for inclusive-tax lines).
    let amount: number;
    if (input.calculationType === 'percentage') {
      const lineRows = await tx.select({ finalLineSubtotal: orderLines.finalLineSubtotal })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, ctx.tenantId)));
      const liveSubtotal = lineRows.reduce((s: number, r: { finalLineSubtotal: number }) => s + r.finalLineSubtotal, 0);
      amount = Math.max(0, Math.round(liveSubtotal * input.value / 100));
    } else {
      amount = input.value; // fixed amount in cents
    }

    // Compute service charge tax when isTaxable is true.
    // Derives rate from order line items, falls back to location default tax group.
    let taxAmount = 0;
    if (input.isTaxable && amount > 0) {
      const rates = await resolveServiceChargeTaxRates(tx, ctx.tenantId, orderId, ctx.locationId!);
      if (rates.length > 0) {
        const taxResult = calculateTaxes({
          lineSubtotal: amount,
          calculationMode: 'exclusive',
          taxRates: rates,
        });
        taxAmount = taxResult.taxTotal;
      }
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
      taxAmount,
      createdBy: ctx.user.id,
    }).returning();

    // Recalculate totals — use discount-aware helper when order has discounts
    // to avoid double-subtracting (finalized line values already reflect discounts)
    const existingDiscounts = await tx.select({ amount: orderDiscounts.amount })
      .from(orderDiscounts)
      .where(and(eq(orderDiscounts.orderId, orderId), eq(orderDiscounts.tenantId, ctx.tenantId)));
    const hasDiscounts = existingDiscounts.some((d: { amount: number }) => d.amount > 0);

    let totals;
    if (hasDiscounts) {
      totals = await recalculateOrderTaxesAfterDiscount(tx, ctx.tenantId, orderId);
    } else {
      const [allLines, allCharges] = await Promise.all([
        tx.select({
          lineSubtotal: orderLines.lineSubtotal,
          lineTax: orderLines.lineTax,
          lineTotal: orderLines.lineTotal,
        }).from(orderLines).where(and(eq(orderLines.orderId, orderId), eq(orderLines.tenantId, ctx.tenantId))),
        tx.select({
          amount: orderCharges.amount,
          taxAmount: orderCharges.taxAmount,
        }).from(orderCharges).where(and(eq(orderCharges.orderId, orderId), eq(orderCharges.tenantId, ctx.tenantId))),
      ]);
      totals = recalculateOrderTotals(allLines, allCharges, []);
    }

    // Combined UPDATE: set totals + increment version in a single DB round-trip
    await tx.update(orders).set({
      ...totals,
      version: sql`version + 1`,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addServiceCharge', { chargeId: charge!.id });

    const event = buildEventFromContext(ctx, 'order.service_charge_added.v1', {
      orderId,
      chargeId: charge!.id,
      chargeType: input.chargeType,
      name: input.name,
      amount,
      taxAmount,
    });

    return { result: charge!, events: [event] };
  });

  auditLogDeferred(ctx, 'order.service_charge_added', 'order', orderId);
  return result;
}
