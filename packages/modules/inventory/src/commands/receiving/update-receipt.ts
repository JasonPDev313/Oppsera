import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  vendors,
  inventoryItems,
  itemUomConversions,
  uoms,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type { UpdateReceiptInput } from '../../validation/receiving';

export async function updateDraftReceipt(
  ctx: RequestContext,
  input: UpdateReceiptInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load receipt
    const rows = await (tx as any)
      .select()
      .from(receivingReceipts)
      .where(
        and(
          eq(receivingReceipts.tenantId, ctx.tenantId),
          eq(receivingReceipts.id, input.receiptId),
        ),
      );
    const receipt = rows[0];
    if (!receipt) throw new NotFoundError('Receipt');
    if (receipt.status !== 'draft') {
      throw new ValidationError('Only draft receipts can be edited');
    }

    // If vendorId is changing, verify it exists
    if (input.vendorId && input.vendorId !== receipt.vendorId) {
      const vRows = await (tx as any)
        .select()
        .from(vendors)
        .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, input.vendorId)));
      if (!vRows[0]) throw new NotFoundError('Vendor');
    }

    // Build update payload
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.vendorId !== undefined) updates.vendorId = input.vendorId;
    if (input.vendorInvoiceNumber !== undefined) updates.vendorInvoiceNumber = input.vendorInvoiceNumber;
    if (input.receivedDate !== undefined) updates.receivedDate = input.receivedDate;
    if (input.freightMode !== undefined) updates.freightMode = input.freightMode;
    if (input.shippingCost !== undefined) updates.shippingCost = input.shippingCost.toString();
    if (input.shippingAllocationMethod !== undefined) updates.shippingAllocationMethod = input.shippingAllocationMethod;
    if (input.taxAmount !== undefined) updates.taxAmount = input.taxAmount.toString();
    if (input.notes !== undefined) updates.notes = input.notes;

    const [updated] = await (tx as any)
      .update(receivingReceipts)
      .set(updates)
      .where(eq(receivingReceipts.id, input.receiptId))
      .returning();

    // If shipping or freight mode changed, rerun allocation on existing lines
    const shippingChanged =
      input.shippingCost !== undefined || input.shippingAllocationMethod !== undefined || input.freightMode !== undefined;

    if (shippingChanged) {
      const lineRows = await (tx as any)
        .select()
        .from(receivingReceiptLines)
        .where(
          and(
            eq(receivingReceiptLines.tenantId, ctx.tenantId),
            eq(receivingReceiptLines.receiptId, input.receiptId),
          ),
        );

      if (lineRows.length > 0) {
        // Resolve conversion factors for all lines
        const lineInputs: ReceiptLineInput[] = [];
        for (const line of lineRows) {
          const factor = await resolveConversionFactor(tx, ctx.tenantId, line.inventoryItemId, line.uomCode);
          lineInputs.push({
            id: line.id,
            quantityReceived: Number(line.quantityReceived),
            unitCost: Number(line.unitCost),
            conversionFactor: factor,
            weight: line.weight ? Number(line.weight) : null,
            volume: line.volume ? Number(line.volume) : null,
          });
        }

        const newShipping = input.shippingCost ?? Number(receipt.shippingCost);
        const newMethod = (input.shippingAllocationMethod ?? receipt.shippingAllocationMethod) as AllocationMethod;
        const freightMode = (input.freightMode ?? updated.freightMode ?? 'allocate') as 'expense' | 'allocate';
        const { computed, subtotal } = recomputeAllLines(lineInputs, newShipping, newMethod, freightMode);

        // Update each line
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

        // Update header totals
        const taxAmt = Number(updated.taxAmount);
        const total = Math.round((subtotal + newShipping + taxAmt) * 10000) / 10000;
        await (tx as any)
          .update(receivingReceipts)
          .set({ subtotal: subtotal.toString(), total: total.toString() })
          .where(eq(receivingReceipts.id, input.receiptId));
      }
    }

    const event = buildEventFromContext(ctx, 'inventory.receipt.updated.v1', {
      receiptId: updated.id,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.updated', 'receiving_receipt', input.receiptId);
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
