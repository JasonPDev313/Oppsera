import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  inventoryItems,
  inventoryMovements,
  itemUomConversions,
  uoms,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getOnHand } from '../../helpers/get-on-hand';
import { checkStockAlerts } from '../../helpers/stock-alerts';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import { weightedAvgCost, lastCost } from '../../services/costing';
import { updateVendorItemCostAfterReceipt } from '../../services/vendor-integration';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type { PostReceiptInput } from '../../validation/receiving';

export async function postReceipt(
  ctx: RequestContext,
  input: PostReceiptInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load receipt
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

    // Idempotent: if already posted, return existing
    if (receipt.status === 'posted') {
      return { result: receipt, events: [] };
    }
    if (receipt.status !== 'draft') {
      throw new ValidationError('Only draft receipts can be posted');
    }

    // 2. Load all lines (must have ≥1)
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, input.receiptId),
        ),
      );
    if (lineRows.length === 0) {
      throw new ValidationError('Cannot post a receipt with no lines');
    }

    // 3. RECOMPUTE everything from scratch (Rule 5)
    const lineInputs: ReceiptLineInput[] = [];
    for (const line of lineRows) {
      const factor = await resolveConversionFactor(tx, ctx.tenantId, line.inventoryItemId, line.uomCode);
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

    // Persist recomputed line values
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

    // 4. For each line: insert movement, update item cost
    const allEvents: any[] = [];

    for (const line of lineRows) {
      const comp = computed.find((c) => c.id === line.id)!;

      // a. Insert inventory movement
      const [movement] = await (tx as any)
        .insert(inventoryMovements)
        .values({
          tenantId: ctx.tenantId,
          locationId: receipt.locationId,
          inventoryItemId: line.inventoryItemId,
          movementType: 'receive',
          quantityDelta: comp.baseQty.toString(),
          unitCost: comp.landedUnitCost.toString(),
          extendedCost: comp.landedCost.toString(),
          referenceType: 'receiving_receipt',
          referenceId: input.receiptId,
          reason: `Receipt ${receipt.receiptNumber}`,
          source: 'manual',
          businessDate: receipt.receivedDate,
          employeeId: ctx.user.id,
          batchId: input.receiptId,
          metadata: {
            receiptNumber: receipt.receiptNumber,
            lineId: line.id,
            uomCode: line.uomCode,
            quantityReceived: Number(line.quantityReceived),
          },
          createdBy: ctx.user.id,
        })
        .returning();

      // b. Get new on-hand
      const currentOnHand = await getOnHand(tx, ctx.tenantId, line.inventoryItemId);

      // c. Load item to get costing method and current cost
      const itemRows = await (tx as any)
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.tenantId, ctx.tenantId),
            eq(inventoryItems.id, line.inventoryItemId),
          ),
        );
      const item = itemRows[0];
      if (item) {
        const prevOnHand = currentOnHand - comp.baseQty;
        const prevCost = Number(item.currentCost ?? 0);

        let newCost: number;
        const method = item.costingMethod ?? 'fifo';
        if (method === 'weighted_avg') {
          newCost = weightedAvgCost(prevOnHand, prevCost, comp.baseQty, comp.landedUnitCost);
        } else if (method === 'standard') {
          newCost = prevCost; // standard cost doesn't change on receive
        } else {
          // fifo or other → use last cost
          newCost = lastCost(comp.landedUnitCost);
        }

        // d. Update inventory item current_cost
        await (tx as any)
          .update(inventoryItems)
          .set({ currentCost: newCost.toString(), updatedAt: new Date() })
          .where(eq(inventoryItems.id, line.inventoryItemId));

        // e. Check stock alerts
        const alertEvents = checkStockAlerts(ctx, {
          inventoryItemId: item.id,
          catalogItemId: item.catalogItemId,
          locationId: receipt.locationId,
          itemName: item.name,
          currentOnHand,
          reorderPoint: item.reorderPoint != null ? parseFloat(item.reorderPoint) : null,
          reorderQuantity: item.reorderQuantity != null ? parseFloat(item.reorderQuantity) : null,
        });
        allEvents.push(...alertEvents);
      }
    }

    // 4f. Update vendor-item pricing from this receipt (Rule VM-4)
    for (const line of lineRows) {
      const comp = computed.find((c) => c.id === line.id)!;
      await updateVendorItemCostAfterReceipt(
        tx, ctx.tenantId, receipt.vendorId, line.inventoryItemId, comp.landedUnitCost,
      );
    }

    // 5. Update receipt: status='posted', final totals
    const taxAmt = Number(receipt.taxAmount);
    const total = Math.round((subtotal + shippingCost + taxAmt) * 10000) / 10000;

    const [postedReceipt] = await (tx as any)
      .update(receivingReceipts)
      .set({
        status: 'posted',
        subtotal: subtotal.toString(),
        total: total.toString(),
        postedAt: new Date(),
        postedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(receivingReceipts.id, input.receiptId))
      .returning();

    // 6. Build posted event
    const postedEvent = buildEventFromContext(ctx, 'inventory.receipt.posted.v1', {
      receiptId: input.receiptId,
      receiptNumber: receipt.receiptNumber,
      vendorId: receipt.vendorId,
      locationId: receipt.locationId,
      lineCount: lineRows.length,
      subtotal,
      shippingCost,
      taxAmount: taxAmt,
      total,
    });

    return { result: postedReceipt, events: [postedEvent, ...allEvents] };
  });

  await auditLog(ctx, 'inventory.receipt.posted', 'receiving_receipt', input.receiptId);
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
