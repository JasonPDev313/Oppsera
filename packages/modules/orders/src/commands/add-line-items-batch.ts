import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError, computePackageAllocations } from '@oppsera/shared';
import type { PackageMetadata } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { and, eq, max, sql } from 'drizzle-orm';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';
import type { AddLineItemInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation } from '../helpers/optimistic-lock';
import { recalculateOrderTotals } from '../helpers/order-totals';
import { recalculateOrderTaxesAfterDiscount } from '../helpers/recalculate-tax-after-discount';

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
  const logTag = '[addLineItemsBatch]';
  const MAX_BATCH_SIZE = 200;

  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw new AppError('BATCH_TOO_LARGE', `Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE} items`, 400);
  }

  // ── Phase 1: Catalog lookups OUTSIDE transaction (batch, 1 semaphore slot) ──

  const catalogApi = getCatalogReadApi();
  const itemIds = items.map((i) => i.catalogItemId);

  let posItems: PosItemData[];
  try {
    const posItemMap = await catalogApi.getItemsForPOS(ctx.tenantId, ctx.locationId!, itemIds);

    // Verify all items were found and maintain original order
    posItems = items.map((item) => {
      const posItem = posItemMap.get(item.catalogItemId);
      if (!posItem) {
        console.error(`${logTag} Catalog item not found: catalogItemId=${item.catalogItemId}, tenant=${ctx.tenantId}, location=${ctx.locationId}`);
        throw new NotFoundError('Catalog item', item.catalogItemId);
      }
      return posItem as PosItemData;
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error(`${logTag} Phase 1 (catalog lookup) failed for orderId=${orderId}:`, {
      itemIds,
      tenant: ctx.tenantId,
      location: ctx.locationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  // Log resolved items for debugging
  console.log(`${logTag} Phase 1 resolved ${posItems.length} items for orderId=${orderId}:`,
    posItems.map((p) => ({ id: p.id, name: p.name, type: p.itemType, priceCents: p.unitPriceCents, taxMode: p.taxInfo.calculationMode, taxRateCount: p.taxInfo.taxRates.length })),
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

  let result;
  try {
    result = await publishWithOutbox(ctx, async (tx) => {
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
      const sortResult = await tx
        .select({ maxSort: max(orderLines.sortOrder) })
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId));
      let nextSort = ((sortResult[0]?.maxSort as number | null) ?? -1) + 1;

      // ── Prepare all line values + tax calculations in memory (no DB calls) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- batch insert values built dynamically
      const lineValues: any[] = [];
      const taxResults: ReturnType<typeof calculateTaxes>[] = [];

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

        // Sanity check: catch NaN before it reaches the DB
        if (Number.isNaN(unitPrice) || Number.isNaN(lineSubtotal) || Number.isNaN(taxResult.taxTotal)) {
          const detail = { catalogItemId: item.catalogItemId, itemType: posItem.itemType, name: posItem.name, unitPrice, lineSubtotal, taxTotal: taxResult.taxTotal, rawPriceCents: posItem.unitPriceCents, qty: item.qty };
          console.error(`${logTag} NaN detected in line calculation:`, detail);
          throw new AppError('CALCULATION_ERROR', `Invalid price calculation for item "${posItem.name}" (${posItem.itemType}). unitPrice=${unitPrice}, lineSubtotal=${lineSubtotal}`, 500);
        }

        taxResults.push(taxResult);
        lineValues.push({
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
          priceOverrideDiscountCents: item.priceOverride
            ? Math.max(0, Math.round((posItem.unitPriceCents - item.priceOverride.unitPrice) * Number(item.qty)))
            : 0,
          lineSubtotal: taxResult.subtotal,
          lineTax: taxResult.taxTotal,
          lineTotal: taxResult.total,
          finalLineSubtotal: taxResult.subtotal,
          finalLineTax: taxResult.taxTotal,
          finalLineTotal: taxResult.total,
          taxCalculationMode: posItem.taxInfo.calculationMode,
          modifiers: item.modifiers ?? null,
          specialInstructions: item.specialInstructions ?? null,
          selectedOptions: item.selectedOptions ?? null,
          packageComponents: components,
          notes: item.notes ?? null,
        });
      }

      // ── Batch insert: 1 query for ALL lines instead of N sequential inserts ──
      // IMPORTANT: Postgres does NOT guarantee RETURNING order matches VALUES order.
      // We sort by sortOrder (which we control via nextSort++) to restore the
      // correspondence with lineValues/taxResults/newIndices arrays.
      let insertedLines: (typeof orderLines.$inferSelect)[];
      try {
        const rawInserted = await tx.insert(orderLines).values(lineValues).returning();
        insertedLines = rawInserted.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      } catch (lineErr) {
        console.error(`${logTag} Failed to batch-insert order lines:`, {
          orderId,
          itemCount: newIndices.length,
          error: lineErr instanceof Error ? lineErr.message : String(lineErr),
          stack: lineErr instanceof Error ? lineErr.stack : undefined,
        });
        throw lineErr;
      }

      // ── Batch insert: 1 query for ALL tax breakdown rows ──
      const allTaxRows: { tenantId: string; orderLineId: string; taxRateId: string | null; taxName: string; rateDecimal: string; amount: number }[] = [];
      for (let i = 0; i < insertedLines.length; i++) {
        const breakdown = taxResults[i]!.breakdown;
        for (const b of breakdown) {
          allTaxRows.push({
            tenantId: ctx.tenantId,
            orderLineId: insertedLines[i]!.id,
            taxRateId: b.taxRateId,
            taxName: b.taxName,
            rateDecimal: String(b.rateDecimal),
            amount: b.amount,
          });
        }
      }
      if (allTaxRows.length > 0) {
        await tx.insert(orderLineTaxes).values(allTaxRows);
      }

      // ── Batch save idempotency keys ──
      await Promise.all(
        newIndices.map((origIdx, i) =>
          saveIdempotencyKey(tx, ctx.tenantId, items[origIdx]!.clientRequestId, 'addLineItem', { lineId: insertedLines[i]!.id }),
        ),
      );

      // ── Build results + events from inserted lines ──
      const createdLines: Record<string, unknown>[] = insertedLines.map((line) => ({ ...line, qty: Number(line.qty) }));
      const events: ReturnType<typeof buildEventFromContext>[] = insertedLines.map((line, i) => {
        const origIdx = newIndices[i]!;
        const item = items[origIdx]!;
        const posItem = posItems[origIdx]!;
        const taxResult = taxResults[i]!;
        return buildEventFromContext(ctx, 'order.line_added.v1', {
          orderId,
          lineId: line.id,
          catalogItemId: item.catalogItemId,
          catalogItemName: posItem.name,
          itemType: posItem.itemType,
          qty: item.qty,
          unitPrice: line.unitPrice,
          lineSubtotal: taxResult.subtotal,
          lineTax: taxResult.taxTotal,
          lineTotal: taxResult.total,
        });
      });

      // ONE total recalculation for the entire batch.
      // Use discount-aware helper when order has discounts to re-prorate across
      // all lines (including the newly added ones) and avoid double-subtraction.
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

      // ONE version increment + totals update
      await tx.update(orders).set({
        ...totals,
        version: sql`version + 1`,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

      return {
        result: {
          order: { ...order, ...totals, version: order.version + 1 },
          lines: createdLines,
        },
        events,
      };
    });
  } catch (err) {
    if (!(err instanceof AppError)) {
      console.error(`${logTag} Phase 2 (transaction) failed for orderId=${orderId}:`, {
        itemSummary: posItems.map((p) => ({ id: p.id, name: p.name, type: p.itemType, priceCents: p.unitPriceCents })),
        tenant: ctx.tenantId,
        location: ctx.locationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
    throw err;
  }

  auditLogDeferred(ctx, 'order.lines_batch_added', 'order', orderId);

  return result;
}
