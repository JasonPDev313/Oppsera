import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError, computePackageAllocations } from '@oppsera/shared';
import type { PackageMetadata } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { eq, max, sql } from 'drizzle-orm';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';
import type { AddLineItemInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation } from '../helpers/optimistic-lock';
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

  // Resolve package component prices before entering the transaction (avoids N serial DB round-trips inside tx)
  const packageMeta =
    posItem.metadata && (posItem.metadata as unknown as PackageMetadata).isPackage
      ? (posItem.metadata as unknown as PackageMetadata)
      : null;

  type EnrichedComponent = {
    catalogItemId: string;
    itemName: string;
    itemType: string;
    qty: number;
    componentUnitPriceCents: number;
    componentExtendedCents: number;
    allocatedRevenueCents: number;
    allocationWeight: number;
    subDepartmentId: string | null;
  };

  let resolvedPackageComponents: EnrichedComponent[] | null = null;

  if (packageMeta?.packageComponents && packageMeta.packageComponents.length > 0) {
    // Fetch component prices + subdepartment IDs in parallel (outside tx for performance)
    const componentData = await Promise.all(
      packageMeta.packageComponents.map(async (comp) => {
        const pricePromise = comp.componentUnitPrice != null
          ? Promise.resolve(Math.round(comp.componentUnitPrice * 100))
          : catalogApi.getEffectivePrice(ctx.tenantId, comp.catalogItemId, ctx.locationId!).then(
              (d) => Math.round(d * 100),
            );
        const subDeptPromise = catalogApi.getSubDepartmentForItem(ctx.tenantId, comp.catalogItemId);
        const [priceCents, subDeptId] = await Promise.all([pricePromise, subDeptPromise]);
        return { priceCents, subDeptId };
      }),
    );

    const unitPriceCents = input.priceOverride
      ? input.priceOverride.unitPrice
      : posItem.unitPriceCents;

    const allocationInputs = packageMeta.packageComponents.map((comp, i) => ({
      catalogItemId: comp.catalogItemId,
      itemName: comp.itemName,
      itemType: comp.itemType,
      qty: comp.qty,
      componentUnitPriceCents: componentData[i]!.priceCents,
      subDepartmentId: componentData[i]!.subDeptId,
    }));

    resolvedPackageComponents = computePackageAllocations(unitPriceCents, allocationInputs);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Parallelize idempotency check + order fetch (independent queries)
    const [idempotencyCheck, order] = await Promise.all([
      checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'addLineItem'),
      fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open'),
    ]);
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

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
      subDepartmentId: posItem.subDepartmentId ?? null,
      taxGroupId: posItem.taxInfo.taxGroups[0]?.id ?? null,
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
      packageComponents: resolvedPackageComponents,
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

    const totals = recalculateOrderTotals(allLines, allCharges, allDiscounts);

    // Combined UPDATE: set totals + increment version in a single DB round-trip
    await (tx as any).update(orders).set({
      ...totals,
      version: sql`version + 1`,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

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

    return { result: { order: { ...order, ...totals, version: order.version + 1 }, line: { ...line!, qty: Number(line!.qty) } }, events: [event] };
  });

  // Fire-and-forget audit log — don't block the API response
  auditLog(ctx, 'order.line_added', 'order', orderId).catch(() => {});
  return result;
}
