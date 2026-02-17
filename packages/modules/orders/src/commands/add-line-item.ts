import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { eq, max } from 'drizzle-orm';
import { getCatalogReadApi, calculateTaxes } from '@oppsera/module-catalog';
import type { AddLineItemInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';

export async function addLineItem(ctx: RequestContext, orderId: string, input: AddLineItemInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const catalogApi = getCatalogReadApi();
  const posItem = await catalogApi.getItemForPOS(ctx.tenantId, ctx.locationId, input.catalogItemId);
  if (!posItem) {
    throw new NotFoundError('Catalog item', input.catalogItemId);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'addLineItem');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    const unitPrice = input.priceOverride ? input.priceOverride.unitPrice : posItem.unitPriceCents;
    const lineSubtotal = Math.round(Number(input.qty) * unitPrice);

    const taxResult = calculateTaxes({
      lineSubtotal,
      calculationMode: posItem.taxInfo.calculationMode,
      taxRates: posItem.taxInfo.taxRates.map((r) => ({
        taxRateId: r.id,
        taxName: r.name,
        rateDecimal: r.rateDecimal,
      })),
    });

    // Get next sort order
    const sortResult = await (tx as any)
      .select({ maxSort: max(orderLines.sortOrder) })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));
    const nextSort = ((sortResult[0]?.maxSort as number | null) ?? -1) + 1;

    const [line] = await (tx as any).insert(orderLines).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      orderId,
      sortOrder: nextSort,
      catalogItemId: input.catalogItemId,
      catalogItemName: posItem.name,
      catalogItemSku: posItem.sku,
      itemType: posItem.itemType,
      qty: String(input.qty),
      unitPrice,
      originalUnitPrice: input.priceOverride ? posItem.unitPriceCents : null,
      priceOverrideReason: input.priceOverride?.reason ?? null,
      priceOverriddenBy: input.priceOverride?.approvedBy ?? null,
      lineSubtotal: taxResult.subtotal,
      lineTax: taxResult.taxTotal,
      lineTotal: taxResult.total,
      taxCalculationMode: posItem.taxInfo.calculationMode,
      modifiers: input.modifiers ?? null,
      specialInstructions: input.specialInstructions ?? null,
      selectedOptions: input.selectedOptions ?? null,
      packageComponents: null,
      notes: input.notes ?? null,
    }).returning();

    // Insert tax breakdown rows
    if (taxResult.breakdown.length > 0) {
      await (tx as any).insert(orderLineTaxes).values(
        taxResult.breakdown.map((b) => ({
          tenantId: ctx.tenantId,
          orderLineId: line!.id,
          taxRateId: b.taxRateId,
          taxName: b.taxName,
          rateDecimal: String(b.rateDecimal),
          amount: b.amount,
        })),
      );
    }

    // Recalculate order totals
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

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addLineItem', { lineId: line!.id });

    const event = buildEventFromContext(ctx, 'order.line_added.v1', {
      orderId,
      lineId: line!.id,
      catalogItemId: input.catalogItemId,
      catalogItemName: posItem.name,
      itemType: posItem.itemType,
      qty: input.qty,
      unitPrice,
      lineSubtotal: taxResult.subtotal,
      lineTax: taxResult.taxTotal,
      lineTotal: taxResult.total,
    });

    return { result: { order: { ...order, ...totals }, line: line! }, events: [event] };
  });

  await auditLog(ctx, 'order.line_added', 'order', orderId);
  return result;
}
