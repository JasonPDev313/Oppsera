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

interface PosItemData {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  itemType: string;
  unitPriceCents: number;
  taxInfo: {
    calculationMode: string;
    taxRates: Array<{ id: string; name: string; rateDecimal: number }>;
    taxGroups: Array<{ id: string }>;
  };
  metadata: unknown;
  categoryId: string | null;
  subDepartmentId: string | null;
}

/**
 * Batch version of addLineItem — processes multiple items in a single transaction.
 * Catalog lookups are parallelized OUTSIDE the transaction for performance.
 * Inside the transaction: one FOR UPDATE lock, all inserts, one total recalc, one version bump.
 */
export async function addLineItemsBatch(
  ctx: RequestContext,
  orderId: string,
  items: AddLineItemInput[],
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // ── Phase 1: Catalog lookups OUTSIDE transaction (parallel) ──────────

  const catalogApi = getCatalogReadApi();

  const posItems = await Promise.all(
    items.map(async (item) => {
      const posItem = await catalogApi.getItemForPOS(ctx.tenantId, ctx.locationId!, item.catalogItemId);
      if (!posItem) {
        throw new NotFoundError('Catalog item', item.catalogItemId);
      }
      return posItem as PosItemData;
    }),
  );

  // Resolve package components for all items that need them (parallel)
  const resolvedComponents = await Promise.all(
    items.map(async (item, idx) => {
      const posItem = posItems[idx]!;
      const packageMeta =
        posItem.metadata && (posItem.metadata as unknown as PackageMetadata).isPackage
          ? (posItem.metadata as unknown as PackageMetadata)
          : null;

      if (!packageMeta?.packageComponents || packageMeta.packageComponents.length === 0) {
        return null;
      }

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

      const unitPriceCents = item.priceOverride
        ? item.priceOverride.unitPrice
        : posItem.unitPriceCents;

      const allocationInputs = packageMeta.packageComponents.map((comp, i) => ({
        catalogItemId: comp.catalogItemId,
        itemName: comp.itemName,
        itemType: comp.itemType,
        qty: comp.qty,
        componentUnitPriceCents: componentData[i]!.priceCents,
        subDepartmentId: componentData[i]!.subDeptId,
      }));

      return computePackageAllocations(unitPriceCents, allocationInputs) as EnrichedComponent[];
    }),
  );

  // ── Phase 2: Single transaction ──────────────────────────────────────

  const result = await publishWithOutbox(ctx, async (tx) => {
    // One FOR UPDATE lock for the entire batch
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Parallel idempotency checks (independent reads within tx)
    const idempotencyChecks = await Promise.all(
      items.map((item) => checkIdempotency(tx, ctx.tenantId, item.clientRequestId, 'addLineItem')),
    );

    // Separate duplicates from new items (preserve original indices)
    const newIndices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!idempotencyChecks[i]!.isDuplicate) {
        newIndices.push(i);
      }
    }

    if (newIndices.length === 0) {
      // All items were duplicates
      return { result: { order, lines: [] as Record<string, unknown>[] }, events: [] };
    }

    // Get current max sort order (single query)
    const sortResult = await (tx as any)
      .select({ maxSort: max(orderLines.sortOrder) })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));
    let nextSort = ((sortResult[0]?.maxSort as number | null) ?? -1) + 1;

    // Insert all new lines
    const createdLines: Record<string, unknown>[] = [];
    const events: ReturnType<typeof buildEventFromContext>[] = [];

    for (const origIdx of newIndices) {
      const item = items[origIdx]!;
      const posItem = posItems[origIdx]!;
      const components = resolvedComponents[origIdx] ?? null;

      const unitPrice = item.priceOverride ? item.priceOverride.unitPrice : posItem.unitPriceCents;
      const lineSubtotal = Math.round(Number(item.qty) * unitPrice);

      const taxResult = calculateTaxes({
        lineSubtotal,
        calculationMode: posItem.taxInfo.calculationMode as 'exclusive' | 'inclusive',
        taxRates: posItem.taxInfo.taxRates.map((r) => ({
          taxRateId: r.id,
          taxName: r.name,
          rateDecimal: r.rateDecimal,
        })),
      });

      const [line] = await (tx as any).insert(orderLines).values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        orderId,
        sortOrder: nextSort++,
        catalogItemId: item.catalogItemId,
        catalogItemName: posItem.name,
        catalogItemSku: posItem.sku,
        itemType: posItem.itemType,
        subDepartmentId: posItem.subDepartmentId ?? null,
        taxGroupId: posItem.taxInfo.taxGroups[0]?.id ?? null,
        qty: String(item.qty),
        unitPrice,
        originalUnitPrice: item.priceOverride ? posItem.unitPriceCents : null,
        priceOverrideReason: item.priceOverride?.reason ?? null,
        priceOverriddenBy: item.priceOverride?.approvedBy ?? null,
        lineSubtotal: taxResult.subtotal,
        lineTax: taxResult.taxTotal,
        lineTotal: taxResult.total,
        taxCalculationMode: posItem.taxInfo.calculationMode,
        modifiers: item.modifiers ?? null,
        specialInstructions: item.specialInstructions ?? null,
        selectedOptions: item.selectedOptions ?? null,
        packageComponents: components,
        notes: item.notes ?? null,
      }).returning();

      // Tax breakdown rows
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

      await saveIdempotencyKey(tx, ctx.tenantId, item.clientRequestId, 'addLineItem', { lineId: line!.id });

      createdLines.push({ ...line!, qty: Number(line!.qty) });

      events.push(buildEventFromContext(ctx, 'order.line_added.v1', {
        orderId,
        lineId: line!.id,
        catalogItemId: item.catalogItemId,
        catalogItemName: posItem.name,
        itemType: posItem.itemType,
        qty: item.qty,
        unitPrice,
        lineSubtotal: taxResult.subtotal,
        lineTax: taxResult.taxTotal,
        lineTotal: taxResult.total,
      }));
    }

    // ONE total recalculation for the entire batch
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

    // ONE version increment + totals update
    await (tx as any).update(orders).set({
      ...totals,
      version: sql`version + 1`,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    return {
      result: {
        order: { ...order, ...totals, version: order.version + 1 },
        lines: createdLines,
      },
      events,
    };
  });

  // Fire-and-forget audit log
  auditLog(ctx, 'order.lines_batch_added', 'order', orderId).catch((e) => {
    console.error('Audit log failed for order.lines_batch_added:', e instanceof Error ? e.message : e);
  });

  return result;
}
