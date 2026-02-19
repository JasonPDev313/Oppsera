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
import { eq, and } from 'drizzle-orm';
import { getOnHand } from '../../helpers/get-on-hand';
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

    // 3. For each line: insert offsetting movement, recalculate cost
    for (const line of lineRows) {
      const baseQty = Number(line.baseQty);
      const landedUnitCost = Number(line.landedUnitCost);

      // Insert reversal movement (negative qty)
      await (tx as any)
        .insert(inventoryMovements)
        .values({
          tenantId: ctx.tenantId,
          locationId: receipt.locationId,
          inventoryItemId: line.inventoryItemId,
          movementType: 'void_reversal',
          quantityDelta: (-baseQty).toString(),
          unitCost: landedUnitCost.toString(),
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
        });

      // Recalculate item cost
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
        const currentOnHand = await getOnHand(tx, ctx.tenantId, item.id);
        const currentCost = Number(item.currentCost ?? 0);
        const method = item.costingMethod ?? 'fifo';

        let newCost = currentCost;
        if (method === 'weighted_avg') {
          // currentOnHand already reflects the reversal (negative delta already summed)
          // We need the on-hand BEFORE the reversal to compute reverse correctly
          const onHandBeforeVoid = currentOnHand + baseQty;
          newCost = reverseWeightedAvgCost(onHandBeforeVoid, currentCost, baseQty, landedUnitCost);
        }
        // For fifo/standard, cost doesn't change on void (fifo layers would need more complex handling)

        await (tx as any)
          .update(inventoryItems)
          .set({ currentCost: newCost.toString(), updatedAt: new Date() })
          .where(eq(inventoryItems.id, item.id));
      }
    }

    // 4. Update receipt status
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

    // 5. Build voided event
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
