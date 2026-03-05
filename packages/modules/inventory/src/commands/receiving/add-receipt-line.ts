import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError, generateUlid } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  inventoryItems,
  catalogItems,
  itemUomConversions,
  uoms,
  itemVendors,
} from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type { AddReceiptLineInput } from '../../validation/receiving';

export async function addReceiptLine(
  ctx: RequestContext,
  input: AddReceiptLineInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load receipt and verify DRAFT
    const receiptRows = await (tx as any)
      .select()
      .from(receivingReceipts)
      .where(
        and(
          eq(receivingReceipts.tenantId, ctx.tenantId),
          eq(receivingReceipts.id, input.receiptId),
        ),
      );
    const receipt = receiptRows[0];
    if (!receipt) throw new NotFoundError('Receipt');
    if (receipt.status !== 'draft') {
      throw new ValidationError('Can only add lines to draft receipts');
    }

    // 2. Resolve inventory item — find existing or auto-create from catalog item
    const item = await resolveInventoryItem(
      tx, ctx.tenantId, receipt.locationId, ctx.user.id,
      input.inventoryItemId, input.catalogItemId,
    );

    // 3. Resolve UOM conversion factor
    const conversionFactor = await resolveConversionFactor(
      tx,
      ctx.tenantId,
      item.id,
      input.uomCode,
      item.baseUnit,
    );

    // 4. Check if there's a vendor-item link
    let vendorItemId: string | null = null;
    const vendorItemRows = await (tx as any)
      .select()
      .from(itemVendors)
      .where(
        and(
          eq(itemVendors.tenantId, ctx.tenantId),
          eq(itemVendors.inventoryItemId, item.id),
          eq(itemVendors.vendorId, receipt.vendorId),
        ),
      );
    if (vendorItemRows[0]) {
      vendorItemId = vendorItemRows[0].id;
    }

    // 5. Get next sort order
    const existingLines = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, input.receiptId),
        ),
      );
    const maxSort = existingLines.reduce(
      (max: number, l: any) => Math.max(max, l.sortOrder ?? 0),
      0,
    );

    // 6. Insert the new line (with placeholder computed values)
    const [newLine] = await (tx as any)
      .insert(receivingReceiptLines)
      .values({
        tenantId: ctx.tenantId,
        receiptId: input.receiptId,
        inventoryItemId: item.id,
        vendorItemId,
        quantityReceived: input.quantityReceived.toString(),
        uomCode: input.uomCode,
        unitCost: input.unitCost.toString(),
        extendedCost: '0',
        allocatedShipping: '0',
        landedCost: '0',
        landedUnitCost: '0',
        baseQty: '0',
        weight: input.weight != null ? input.weight.toString() : null,
        volume: input.volume != null ? input.volume.toString() : null,
        lotNumber: input.lotNumber ?? null,
        serialNumbers: input.serialNumbers ?? null,
        expirationDate: input.expirationDate ?? null,
        sortOrder: maxSort + 1,
        notes: input.notes ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        purchaseOrderLineId: input.purchaseOrderLineId ?? null,
      })
      .returning();

    // 7. Recompute ALL lines (including the new one).
    //    Batch-fetch all items and UOM conversions needed for existing lines in two
    //    queries instead of 2×N individual queries (N+1 fix).
    const allLines = [...existingLines, newLine];

    // Collect the unique inventoryItemIds from existing lines (not the new line — we already
    // have its factor).
    const existingLineItemIds: string[] = Array.from(
      new Set(existingLines.map((l: any) => String(l.inventoryItemId))),
    );

    // Batch-fetch base units for all existing-line items in one query.
    const existingItemRows = existingLineItemIds.length > 0
      ? await (tx as any)
          .select({ id: inventoryItems.id, baseUnit: inventoryItems.baseUnit })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.tenantId, ctx.tenantId),
              inArray(inventoryItems.id, existingLineItemIds),
            ),
          )
      : [];
    const itemBaseUnitMap = new Map<string, string>(
      Array.from(existingItemRows as Iterable<{ id: string; baseUnit: string }>).map(
        (r) => [r.id, r.baseUnit],
      ),
    );

    // Collect UOM codes needed for existing lines that differ from the item's baseUnit.
    const uomCodesNeeded = new Set<string>();
    for (const line of existingLines) {
      const baseUnit = itemBaseUnitMap.get(line.inventoryItemId) ?? '';
      if (line.uomCode.toLowerCase() !== baseUnit.toLowerCase()) {
        uomCodesNeeded.add(line.uomCode);
      }
    }

    // Batch-fetch UOM ids for needed codes in one query.
    const uomCodeArr = Array.from(uomCodesNeeded);
    const uomRows = uomCodeArr.length > 0
      ? await (tx as any)
          .select({ id: uoms.id, code: uoms.code })
          .from(uoms)
          .where(and(eq(uoms.tenantId, ctx.tenantId), inArray(uoms.code, uomCodeArr)))
      : [];
    const uomIdByCode = new Map<string, string>(
      Array.from(uomRows as Iterable<{ id: string; code: string }>).map((r) => [r.code, r.id]),
    );

    // Batch-fetch UOM conversions for all (inventoryItemId, fromUomId) pairs in one query.
    const uomIdArr: string[] = Array.from(new Set(uomRows.map((r: { id: string }) => r.id)));
    const convRows = existingLineItemIds.length > 0 && uomIdArr.length > 0
      ? await (tx as any)
          .select()
          .from(itemUomConversions)
          .where(
            and(
              eq(itemUomConversions.tenantId, ctx.tenantId),
              inArray(itemUomConversions.inventoryItemId, existingLineItemIds),
              inArray(itemUomConversions.fromUomId, uomIdArr),
            ),
          )
      : [];
    // Key: `${inventoryItemId}:${fromUomId}` → conversionFactor
    const convMap = new Map<string, number>(
      Array.from(
        convRows as Iterable<{ inventoryItemId: string; fromUomId: string; conversionFactor: string }>,
      ).map((r) => [`${r.inventoryItemId}:${r.fromUomId}`, Number(r.conversionFactor)]),
    );

    const lineInputs: ReceiptLineInput[] = [];
    for (const line of allLines) {
      let factor: number;
      if (line.id === newLine.id) {
        // New line already resolved its factor before insertion.
        factor = conversionFactor;
      } else {
        // Resolve factor from batched data — no additional DB queries.
        const baseUnit = itemBaseUnitMap.get(line.inventoryItemId) ?? '';
        if (line.uomCode.toLowerCase() === baseUnit.toLowerCase()) {
          factor = 1;
        } else {
          const uomId = uomIdByCode.get(line.uomCode);
          factor = uomId ? (convMap.get(`${line.inventoryItemId}:${uomId}`) ?? 1) : 1;
        }
      }
      lineInputs.push({
        id: line.id,
        quantityReceived: Number(line.quantityReceived),
        unitCost: Number(line.unitCost),
        conversionFactor: factor,
        weight: line.weight ? Number(line.weight) : null,
        volume: line.volume ? Number(line.volume) : null,
      });
    }

    const shippingCost = Number(receipt.shippingCost);
    const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;
    const freightMode = (receipt.freightMode ?? 'allocate') as 'expense' | 'allocate';
    const { computed, subtotal } = recomputeAllLines(lineInputs, shippingCost, allocationMethod, freightMode);

    // 8. Persist computed values for every line
    for (const c of computed) {
      await (tx as any)
        .update(receivingReceiptLines)
        .set({
          extendedCost: c.extendedCost.toString(),
          baseQty: c.baseQty.toString(),
          allocatedShipping: c.allocatedShipping.toString(),
          landedCost: c.landedCost.toString(),
          landedUnitCost: c.landedUnitCost.toString(),
          updatedAt: new Date(),
        })
        .where(eq(receivingReceiptLines.id, c.id));
    }

    // 9. Update header totals
    const taxAmt = Number(receipt.taxAmount);
    const total = Math.round((subtotal + shippingCost + taxAmt) * 10000) / 10000;
    await (tx as any)
      .update(receivingReceipts)
      .set({
        subtotal: subtotal.toString(),
        total: total.toString(),
        updatedAt: new Date(),
      })
      .where(eq(receivingReceipts.id, input.receiptId));

    const event = buildEventFromContext(ctx, 'inventory.receipt.line_added.v1', {
      receiptId: input.receiptId,
      lineId: newLine.id,
      inventoryItemId: item.id,
      quantity: input.quantityReceived,
      unitCost: input.unitCost,
    });

    return { result: newLine, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.line_added', 'receiving_receipt', input.receiptId);
  return result;
}

/**
 * Resolve the inventory item to use for a receipt line.
 * - If inventoryItemId is given, verify it exists at the location.
 * - If only catalogItemId is given, look up existing inventory item or auto-create one.
 */
async function resolveInventoryItem(
  tx: any,
  tenantId: string,
  locationId: string,
  userId: string,
  inventoryItemId?: string,
  catalogItemId?: string,
): Promise<{ id: string; baseUnit: string }> {
  // Path 1: direct inventory item ID
  if (inventoryItemId) {
    const rows = await (tx as any)
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.id, inventoryItemId),
          eq(inventoryItems.locationId, locationId),
        ),
      );
    if (rows[0]) return { id: rows[0].id, baseUnit: rows[0].baseUnit };
    throw new NotFoundError('Inventory item');
  }

  // Path 2: catalog item — look up or auto-create inventory item
  if (!catalogItemId) throw new ValidationError('Either inventoryItemId or catalogItemId is required');

  // Check if catalog item exists
  const catalogRows = await (tx as any)
    .select()
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.tenantId, tenantId),
        eq(catalogItems.id, catalogItemId),
      ),
    );
  const catItem = catalogRows[0];
  if (!catItem) throw new NotFoundError('Catalog item');

  // Check if inventory item already exists at this location
  const existingInv = await (tx as any)
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.tenantId, tenantId),
        eq(inventoryItems.catalogItemId, catalogItemId),
        eq(inventoryItems.locationId, locationId),
      ),
    );

  if (existingInv[0]) {
    return { id: existingInv[0].id, baseUnit: existingInv[0].baseUnit };
  }

  // Auto-create inventory item from catalog item
  const [created] = await (tx as any)
    .insert(inventoryItems)
    .values({
      id: generateUlid(),
      tenantId,
      locationId,
      catalogItemId,
      name: catItem.name,
      sku: catItem.sku ?? null,
      itemType: catItem.itemType,
      status: 'active',
      trackInventory: true,
      baseUnit: 'each',
      purchaseUnit: 'each',
      purchaseToBaseRatio: '1',
      costingMethod: 'fifo',
      allowNegative: false,
      currentCost: catItem.cost ?? '0',
      createdBy: userId,
    })
    .returning();

  return { id: created.id, baseUnit: created.baseUnit };
}

/**
 * Resolve UOM conversion factor for a given item + uomCode.
 * Returns 1 if the uomCode matches the item's baseUnit.
 */
async function resolveConversionFactor(
  tx: any,
  tenantId: string,
  inventoryItemId: string,
  uomCode: string,
  baseUnit: string,
): Promise<number> {
  if (uomCode.toLowerCase() === baseUnit.toLowerCase()) return 1;

  const uomRows = await (tx as any)
    .select()
    .from(uoms)
    .where(and(eq(uoms.tenantId, tenantId), eq(uoms.code, uomCode)));
  const uom = uomRows[0];
  if (!uom) return 1;

  const convRows = await (tx as any)
    .select()
    .from(itemUomConversions)
    .where(
      and(
        eq(itemUomConversions.tenantId, tenantId),
        eq(itemUomConversions.inventoryItemId, inventoryItemId),
        eq(itemUomConversions.fromUomId, uom.id),
      ),
    );
  const conv = convRows[0];
  return conv ? Number(conv.conversionFactor) : 1;
}