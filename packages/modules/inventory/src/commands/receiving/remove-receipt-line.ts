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

export async function removeReceiptLine(
  ctx: RequestContext,
  lineId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the line
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.id, lineId),
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
      throw new ValidationError('Can only remove lines from draft receipts');
    }

    // 3. Delete the line
    await (tx as any)
      .delete(receivingReceiptLines)
      .where(eq(receivingReceiptLines.id, lineId));

    // 4. Recompute remaining lines
    const remainingRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, line.receiptId),
        ),
      );

    const shippingCost = Number(receipt.shippingCost);
    const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;

    if (remainingRows.length > 0) {
      const lineInputs: ReceiptLineInput[] = [];
      for (const l of remainingRows) {
        const factor = await resolveConversionFactor(tx, ctx.tenantId, l.inventoryItemId, l.uomCode);
        lineInputs.push({
          id: l.id,
          quantityReceived: Number(l.quantityReceived),
          unitCost: Number(l.unitCost),
          conversionFactor: factor,
          weight: l.weight ? Number(l.weight) : null,
          volume: l.volume ? Number(l.volume) : null,
        });
      }

      const freightMode = receipt.freightMode ?? 'allocate';
      const { computed, subtotal } = recomputeAllLines(lineInputs, shippingCost, allocationMethod, freightMode);

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
    } else {
      // No lines remaining — zero out totals
      await (tx as any)
        .update(receivingReceipts)
        .set({ subtotal: '0', total: '0', updatedAt: new Date() })
        .where(eq(receivingReceipts.id, line.receiptId));
    }

    const event = buildEventFromContext(ctx, 'inventory.receipt.line_removed.v1', {
      receiptId: line.receiptId,
      lineId,
      inventoryItemId: line.inventoryItemId,
    });

    return { result: { deleted: true, lineId }, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.line_removed', 'receiving_receipt_line', lineId);
  return result;
}

async function resolveConversionFactor(
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
  return convRows[0] ? Number(convRows[0].conversionFactor) : 1;
}
