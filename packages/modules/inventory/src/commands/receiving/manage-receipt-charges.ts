import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  receiptCharges,
  inventoryItems,
  itemUomConversions,
  uoms,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type {
  AddReceiptChargeInput,
  UpdateReceiptChargeInput,
  RemoveReceiptChargeInput,
} from '../../validation/receiving';

// ── Add Charge ──────────────────────────────────────────────────

export async function addReceiptCharge(
  ctx: RequestContext,
  input: AddReceiptChargeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load receipt, verify draft
    const receipt = await loadDraftReceipt(tx, ctx.tenantId, input.receiptId);

    // Get next sort order
    const existingCharges = await (tx as any)
      .select()
      .from(receiptCharges)
      .where(
        and(
          eq(receiptCharges.tenantId, ctx.tenantId),
          eq(receiptCharges.receiptId, input.receiptId),
        ),
      );
    const maxSort = existingCharges.reduce(
      (max: number, c: any) => Math.max(max, c.sortOrder ?? 0),
      0,
    );

    const [created] = await (tx as any)
      .insert(receiptCharges)
      .values({
        tenantId: ctx.tenantId,
        receiptId: input.receiptId,
        chargeType: input.chargeType ?? 'shipping',
        description: input.description ?? null,
        amount: input.amount.toString(),
        glAccountCode: input.glAccountCode ?? null,
        glAccountName: input.glAccountName ?? null,
        sortOrder: maxSort + 1,
      })
      .returning();

    // Recompute receipt shippingCost = SUM(charges)
    await recomputeShippingFromCharges(tx, ctx.tenantId, input.receiptId, receipt);

    const event = buildEventFromContext(ctx, 'inventory.receipt.charge_added.v1', {
      receiptId: input.receiptId,
      chargeId: created.id,
      amount: input.amount,
    });

    return { result: created, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.charge_added', 'receiving_receipt', input.receiptId);
  return result;
}

// ── Update Charge ───────────────────────────────────────────────

export async function updateReceiptCharge(
  ctx: RequestContext,
  input: UpdateReceiptChargeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load charge
    const chargeRows = await (tx as any)
      .select()
      .from(receiptCharges)
      .where(
        and(
          eq(receiptCharges.tenantId, ctx.tenantId),
          eq(receiptCharges.id, input.chargeId),
        ),
      );
    const charge = chargeRows[0];
    if (!charge) throw new NotFoundError('Receipt charge');

    // Verify receipt is draft
    const receipt = await loadDraftReceipt(tx, ctx.tenantId, charge.receiptId);

    // Build update
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.chargeType !== undefined) updates.chargeType = input.chargeType;
    if (input.description !== undefined) updates.description = input.description;
    if (input.amount !== undefined) updates.amount = input.amount.toString();
    if (input.glAccountCode !== undefined) updates.glAccountCode = input.glAccountCode;
    if (input.glAccountName !== undefined) updates.glAccountName = input.glAccountName;

    const [updated] = await (tx as any)
      .update(receiptCharges)
      .set(updates)
      .where(eq(receiptCharges.id, input.chargeId))
      .returning();

    // Recompute shippingCost if amount changed
    if (input.amount !== undefined) {
      await recomputeShippingFromCharges(tx, ctx.tenantId, charge.receiptId, receipt);
    }

    const event = buildEventFromContext(ctx, 'inventory.receipt.charge_updated.v1', {
      receiptId: charge.receiptId,
      chargeId: input.chargeId,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.charge_updated', 'receipt_charge', input.chargeId);
  return result;
}

// ── Remove Charge ───────────────────────────────────────────────

export async function removeReceiptCharge(
  ctx: RequestContext,
  input: RemoveReceiptChargeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load charge
    const chargeRows = await (tx as any)
      .select()
      .from(receiptCharges)
      .where(
        and(
          eq(receiptCharges.tenantId, ctx.tenantId),
          eq(receiptCharges.id, input.chargeId),
        ),
      );
    const charge = chargeRows[0];
    if (!charge) throw new NotFoundError('Receipt charge');

    // Verify receipt is draft
    const receipt = await loadDraftReceipt(tx, ctx.tenantId, charge.receiptId);

    // Delete the charge
    await (tx as any)
      .delete(receiptCharges)
      .where(eq(receiptCharges.id, input.chargeId));

    // Recompute shippingCost
    await recomputeShippingFromCharges(tx, ctx.tenantId, charge.receiptId, receipt);

    const event = buildEventFromContext(ctx, 'inventory.receipt.charge_removed.v1', {
      receiptId: charge.receiptId,
      chargeId: input.chargeId,
    });

    return { result: { chargeId: input.chargeId, receiptId: charge.receiptId }, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.charge_removed', 'receipt_charge', input.chargeId);
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────

async function loadDraftReceipt(tx: any, tenantId: string, receiptId: string) {
  const rows = await (tx as any)
    .select()
    .from(receivingReceipts)
    .where(
      and(
        eq(receivingReceipts.tenantId, tenantId),
        eq(receivingReceipts.id, receiptId),
      ),
    );
  const receipt = rows[0];
  if (!receipt) throw new NotFoundError('Receipt');
  if (receipt.status !== 'draft') {
    throw new ValidationError('Can only modify charges on draft receipts');
  }
  return receipt;
}

/**
 * Recompute receipt.shippingCost = SUM(receipt_charges.amount) for this receipt,
 * then rerun line allocation if in ALLOCATE mode.
 */
async function recomputeShippingFromCharges(
  tx: any,
  tenantId: string,
  receiptId: string,
  receipt: any,
) {
  // Sum all charges for this receipt
  const sumRows = await tx.execute(
    sql`SELECT COALESCE(SUM(amount), 0) AS total
        FROM receipt_charges
        WHERE tenant_id = ${tenantId} AND receipt_id = ${receiptId}`,
  );
  const chargeTotal = Number(
    Array.from(sumRows as Iterable<{ total: string }>)[0]?.total ?? 0,
  );

  // Update receipt.shippingCost (denormalized cache)
  await (tx as any)
    .update(receivingReceipts)
    .set({ shippingCost: chargeTotal.toString(), updatedAt: new Date() })
    .where(eq(receivingReceipts.id, receiptId));

  // If ALLOCATE mode, rerun line allocation
  const freightMode = receipt.freightMode ?? 'allocate';
  if (freightMode === 'allocate') {
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, tenantId),
          eq(receivingReceiptLines.receiptId, receiptId),
        ),
      );

    if (lineRows.length > 0) {
      const lineInputs: ReceiptLineInput[] = [];
      for (const line of lineRows) {
        const factor = await resolveConversionFactor(tx, tenantId, line.inventoryItemId, line.uomCode);
        lineInputs.push({
          id: line.id,
          quantityReceived: Number(line.quantityReceived),
          unitCost: Number(line.unitCost),
          conversionFactor: factor,
          weight: line.weight ? Number(line.weight) : null,
          volume: line.volume ? Number(line.volume) : null,
        });
      }

      const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;
      const { computed, subtotal } = recomputeAllLines(
        lineInputs, chargeTotal, allocationMethod, 'allocate',
      );

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
      const taxAmt = Number(receipt.taxAmount);
      const total = Math.round((subtotal + chargeTotal + taxAmt) * 10000) / 10000;
      await (tx as any)
        .update(receivingReceipts)
        .set({ subtotal: subtotal.toString(), total: total.toString() })
        .where(eq(receivingReceipts.id, receiptId));
    }
  }
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
