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
import { eq, and } from 'drizzle-orm';
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

    // 7. Recompute ALL lines (including the new one)
    const allLines = [...existingLines, newLine];
    const lineInputs: ReceiptLineInput[] = [];
    for (const line of allLines) {
      let factor: number;
      if (line.id === newLine.id) {
        factor = conversionFactor;
      } else {
        factor = await resolveConversionFactorByItemId(tx, ctx.tenantId, line.inventoryItemId, line.uomCode);
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

/**
 * Self-contained conversion factor lookup — looks up item's baseUnit from DB.
 * Used for existing lines where the caller doesn't have the item loaded.
 */
async function resolveConversionFactorByItemId(
  tx: any,
  tenantId: string,
  inventoryItemId: string,
  uomCode: string,
): Promise<number> {
  const itemRows = await (tx as any)
    .select({ baseUnit: inventoryItems.baseUnit })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, inventoryItemId)));
  const item = itemRows[0];
  if (!item) return 1;
  return resolveConversionFactor(tx, tenantId, inventoryItemId, uomCode, item.baseUnit);
}
