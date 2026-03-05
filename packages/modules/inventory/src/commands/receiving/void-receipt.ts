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
} from '@oppsera/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { reverseWeightedAvgCost } from '../../services/costing';
import type { VoidReceiptInput } from '../../validation/receiving';

export async function voidReceipt(
  ctx: RequestContext,
  input: VoidReceiptInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load receipt, verify status='posted'
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

    // Idempotent: already voided
    if (receipt.status === 'voided') {
      return { result: receipt, events: [] };
    }
    if (receipt.status !== 'posted') {
      throw new ValidationError('Only posted receipts can be voided');
    }

    // 2. Load all lines
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, input.receiptId),
        ),
      );

    // 3. Batch-insert all reversal movements in parallel.
    //    Each line gets a single offsetting movement (negative qty).
    //    Promise.all is safe here — all inserts share the same transaction.
    await Promise.all(
      lineRows.map((line: any) =>
        (tx as any)
          .insert(inventoryMovements)
          .values({
            tenantId: ctx.tenantId,
            locationId: receipt.locationId,
            inventoryItemId: line.inventoryItemId,
            movementType: 'void_reversal',
            quantityDelta: (-Number(line.baseQty)).toString(),
            unitCost: Number(line.landedUnitCost).toString(),
            extendedCost: (-Number(line.landedCost)).toString(),
            referenceType: 'receiving_receipt',
            referenceId: input.receiptId,
            reason: `Void receipt ${receipt.receiptNumber}: ${input.reason}`,
            source: 'manual',
            businessDate: receipt.receivedDate,
            employeeId: ctx.user.id,
            batchId: input.receiptId,
            metadata: {
              receiptNumber: receipt.receiptNumber,
              lineId: line.id,
              voidReason: input.reason,
            },
            createdBy: ctx.user.id,
          }),
      ),
    );

    // 4. Batch-fetch all inventory items touched by this receipt in one query.
    const itemIds: string[] = Array.from(new Set(lineRows.map((l: any) => String(l.inventoryItemId)) as string[]));
    const itemRows = await (tx as any)
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, ctx.tenantId),
          inArray(inventoryItems.id, itemIds),
        ),
      );
    const itemMap = new Map<string, any>(itemRows.map((r: any) => [r.id, r]));

    // 5. Batch-compute on-hand for all affected items in a single aggregation query.
    //    At this point the reversal movements have already been inserted into this
    //    transaction, so SUM(quantityDelta) reflects the post-reversal on-hand.
    const onHandRows = await (tx as any)
      .select({
        inventoryItemId: inventoryMovements.inventoryItemId,
        total: sql<string>`COALESCE(SUM(${inventoryMovements.quantityDelta}), 0)`,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenantId, ctx.tenantId),
          inArray(inventoryMovements.inventoryItemId, itemIds),
        ),
      )
      .groupBy(inventoryMovements.inventoryItemId);
    const onHandMap = new Map<string, number>(
      Array.from(onHandRows as Iterable<{ inventoryItemId: string; total: string }>).map(
        (r) => [r.inventoryItemId, parseFloat(r.total)],
      ),
    );

    // 6. Build a per-item qty map: sum baseQty for all lines that share the same inventoryItemId.
    //    A receipt can have multiple lines for the same item (different lots, etc.).
    const itemBaseQtyMap = new Map<string, number>();
    for (const line of lineRows) {
      const prev = itemBaseQtyMap.get(line.inventoryItemId) ?? 0;
      itemBaseQtyMap.set(line.inventoryItemId, prev + Number(line.baseQty));
    }

    // 6b. Pre-compute a quantity-weighted average landed unit cost per item across ALL lines.
    //     Using only the first line's cost (as in the original code) is wrong when an item
    //     appears on multiple lines with different unit costs (e.g., different lots).
    const itemWeightedCostMap = new Map<string, number>();
    for (const itemId of itemIds) {
      const linesForItem = lineRows.filter((l: any) => l.inventoryItemId === itemId);
      const totalQty = linesForItem.reduce((sum: number, l: any) => sum + Number(l.baseQty), 0);
      if (totalQty === 0) {
        // Fallback: use cost of any available line (no qty to weight by)
        const fallback = linesForItem[0];
        itemWeightedCostMap.set(itemId, fallback ? Number(fallback.landedUnitCost) : 0);
      } else {
        // Quantity-weighted average: sum(qty * unitCost) / totalQty
        const weightedSum = linesForItem.reduce(
          (sum: number, l: any) => sum + Number(l.baseQty) * Number(l.landedUnitCost),
          0,
        );
        itemWeightedCostMap.set(itemId, weightedSum / totalQty);
      }
    }

    // 7. Batch-update all affected inventory items in parallel.
    //    Compute new cost from post-reversal on-hand, then derive pre-reversal on-hand for the
    //    weighted_avg formula: onHandBeforeVoid = currentOnHand(post-reversal) + baseQty.
    await Promise.all(
      itemIds.map((itemId) => {
        const item = itemMap.get(itemId);
        if (!item) return Promise.resolve();

        const currentOnHand = onHandMap.get(itemId) ?? 0; // post-reversal on-hand
        const currentCost = Number(item.currentCost ?? 0);
        const method: string = item.costingMethod ?? 'fifo';
        const baseQty = itemBaseQtyMap.get(itemId) ?? 0;

        let newCost = currentCost;
        if (method === 'weighted_avg') {
          // currentOnHand is post-reversal; reverseWeightedAvgCost expects pre-reversal on-hand
          const onHandBeforeVoid = currentOnHand + baseQty;
          // Use the quantity-weighted average unit cost across all lines for this item
          // (not just the first line) to correctly account for multi-line receipts.
          const landedUnitCost = itemWeightedCostMap.get(itemId) ?? currentCost;
          newCost = reverseWeightedAvgCost(onHandBeforeVoid, currentCost, baseQty, landedUnitCost);
        }
        // For fifo/standard, cost doesn't change on void (fifo layers would need more complex handling)

        return (tx as any)
          .update(inventoryItems)
          .set({ currentCost: newCost.toString(), updatedAt: new Date() })
          .where(eq(inventoryItems.id, itemId));
      }),
    );

    // 8. Update receipt status
    const [voidedReceipt] = await (tx as any)
      .update(receivingReceipts)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(receivingReceipts.id, input.receiptId))
      .returning();

    // 9. Build voided event
    const event = buildEventFromContext(ctx, 'inventory.receipt.voided.v1', {
      receiptId: input.receiptId,
      receiptNumber: receipt.receiptNumber,
      vendorId: receipt.vendorId,
      locationId: receipt.locationId,
      lineCount: lineRows.length,
      reason: input.reason,
    });

    return { result: voidedReceipt, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.voided', 'receiving_receipt', input.receiptId);
  return result;
}
