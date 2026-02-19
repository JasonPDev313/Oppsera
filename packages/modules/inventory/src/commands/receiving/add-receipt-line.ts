import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  inventoryItems,
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

    // 2. Verify inventory item exists at this location
    const itemRows = await (tx as any)
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, ctx.tenantId),
          eq(inventoryItems.id, input.inventoryItemId),
          eq(inventoryItems.locationId, receipt.locationId),
        ),
      );
    const item = itemRows[0];
    if (!item) throw new NotFoundError('Inventory item');

    // 3. Resolve UOM conversion factor
    const conversionFactor = await resolveConversionFactor(
      tx,
      ctx.tenantId,
      input.inventoryItemId,
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
          eq(itemVendors.inventoryItemId, input.inventoryItemId),
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
        inventoryItemId: input.inventoryItemId,
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
      const factor =
        line.id === newLine.id
          ? conversionFactor
          : await resolveConversionFactor(tx, ctx.tenantId, line.inventoryItemId, line.uomCode, item.baseUnit);
      lineInputs.push({
        id: line.id,
        quantityReceived: Number(line.quantityReceived),
        unitCost: Number(line.unitCost),
        conversionFactor: factor,
        weight: line.weight ? Number(line.weight) : null,
      });
    }

    const shippingCost = Number(receipt.shippingCost);
    const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;
    const { computed, subtotal } = recomputeAllLines(lineInputs, shippingCost, allocationMethod);

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
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantityReceived,
      unitCost: input.unitCost,
    });

    return { result: newLine, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.line_added', 'receiving_receipt', input.receiptId);
  return result;
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
  // If uomCode matches baseUnit, factor = 1
  if (uomCode.toLowerCase() === baseUnit.toLowerCase()) return 1;

  // Look up conversion: find UOM by code, then find conversion row
  const uomRows = await (tx as any)
    .select()
    .from(uoms)
    .where(and(eq(uoms.tenantId, tenantId), eq(uoms.code, uomCode)));
  const uom = uomRows[0];
  if (!uom) return 1; // If UOM not found, assume base

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
