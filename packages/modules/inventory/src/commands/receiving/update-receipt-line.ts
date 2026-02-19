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
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type { UpdateReceiptLineInput } from '../../validation/receiving';

export async function updateReceiptLine(
  ctx: RequestContext,
  input: UpdateReceiptLineInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the line
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.id, input.lineId),
        ),
      );
    const line = lineRows[0];
    if (!line) throw new NotFoundError('Receipt line');

    // 2. Load receipt, verify DRAFT
    const receiptRows = await (tx as any)
      .select()
      .from(receivingReceipts)
      .where(
        and(
          eq(receivingReceipts.tenantId, ctx.tenantId),
          eq(receivingReceipts.id, line.receiptId),
        ),
      );
    const receipt = receiptRows[0];
    if (!receipt) throw new NotFoundError('Receipt');
    if (receipt.status !== 'draft') {
      throw new ValidationError('Can only edit lines on draft receipts');
    }

    // 3. Apply updates to the line
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.quantityReceived !== undefined) updates.quantityReceived = input.quantityReceived.toString();
    if (input.uomCode !== undefined) updates.uomCode = input.uomCode;
    if (input.unitCost !== undefined) updates.unitCost = input.unitCost.toString();
    if (input.weight !== undefined) updates.weight = input.weight != null ? input.weight.toString() : null;
    if (input.lotNumber !== undefined) updates.lotNumber = input.lotNumber;
    if (input.serialNumbers !== undefined) updates.serialNumbers = input.serialNumbers;
    if (input.expirationDate !== undefined) updates.expirationDate = input.expirationDate;
    if (input.notes !== undefined) updates.notes = input.notes;

    await (tx as any)
      .update(receivingReceiptLines)
      .set(updates)
      .where(eq(receivingReceiptLines.id, input.lineId));

    // 4. Reload ALL lines for this receipt and recompute
    const allLineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, line.receiptId),
        ),
      );

    const lineInputs: ReceiptLineInput[] = [];
    for (const l of allLineRows) {
      const factor = await resolveConversionFactor(tx, ctx.tenantId, l.inventoryItemId, l.uomCode);
      lineInputs.push({
        id: l.id,
        quantityReceived: Number(l.quantityReceived),
        unitCost: Number(l.unitCost),
        conversionFactor: factor,
        weight: l.weight ? Number(l.weight) : null,
      });
    }

    const shippingCost = Number(receipt.shippingCost);
    const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;
    const { computed, subtotal } = recomputeAllLines(lineInputs, shippingCost, allocationMethod);

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

    const taxAmt = Number(receipt.taxAmount);
    const total = Math.round((subtotal + shippingCost + taxAmt) * 10000) / 10000;
    await (tx as any)
      .update(receivingReceipts)
      .set({ subtotal: subtotal.toString(), total: total.toString(), updatedAt: new Date() })
      .where(eq(receivingReceipts.id, line.receiptId));

    const event = buildEventFromContext(ctx, 'inventory.receipt.line_updated.v1', {
      receiptId: line.receiptId,
      lineId: input.lineId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: allLineRows.find((l: any) => l.id === input.lineId), events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.line_updated', 'receiving_receipt_line', input.lineId);
  return result;
}

async function resolveConversionFactor(
  tx: any,
  tenantId: string,
  inventoryItemId: string,
  uomCode: string,
): Promise<number> {
  // Look up the item's base unit
  const itemRows = await (tx as any)
    .select({ baseUnit: inventoryItems.baseUnit })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, inventoryItemId)));
  const item = itemRows[0];
  if (!item) return 1;
  if (uomCode.toLowerCase() === item.baseUnit.toLowerCase()) return 1;

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
