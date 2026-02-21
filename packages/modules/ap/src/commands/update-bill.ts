import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { BillStatusError } from '../errors';
import type { UpdateBillInput } from '../validation';

export async function updateBill(
  ctx: RequestContext,
  billId: string,
  input: UpdateBillInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load bill and verify it's draft
    const [bill] = await tx
      .select()
      .from(apBills)
      .where(
        and(
          eq(apBills.id, billId),
          eq(apBills.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw new NotFoundError('Bill', billId);
    }

    if (bill.status !== 'draft') {
      throw new BillStatusError(billId, bill.status, 'draft');
    }

    // 2. Build update set for the header
    const updateSet: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.billNumber !== undefined) updateSet.billNumber = input.billNumber;
    if (input.billDate !== undefined) updateSet.billDate = input.billDate;
    if (input.dueDate !== undefined) updateSet.dueDate = input.dueDate;
    if (input.memo !== undefined) updateSet.memo = input.memo;
    if (input.locationId !== undefined) updateSet.locationId = input.locationId;
    if (input.paymentTermsId !== undefined) updateSet.paymentTermsId = input.paymentTermsId;
    if (input.vendorInvoiceNumber !== undefined) updateSet.vendorInvoiceNumber = input.vendorInvoiceNumber;

    // 3. If lines are provided, recompute total and replace all lines
    if (input.lines && input.lines.length > 0) {
      // Delete existing lines
      const existingLines = await tx
        .select({ id: apBillLines.id })
        .from(apBillLines)
        .where(eq(apBillLines.billId, billId));

      for (const line of existingLines) {
        await tx
          .delete(apBillLines)
          .where(eq(apBillLines.id, line.id));
      }

      // Insert new lines
      let computedTotal = 0;
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        computedTotal += Number(line.amount);

        await tx
          .insert(apBillLines)
          .values({
            id: generateUlid(),
            tenantId: ctx.tenantId,
            billId,
            lineType: mapLineType(line.lineType),
            accountId: line.glAccountId,
            description: line.description ?? null,
            quantity: line.quantity ?? '1',
            unitCost: line.unitCost ?? '0',
            amount: line.amount,
            locationId: line.locationId ?? null,
            departmentId: line.departmentId ?? null,
            inventoryItemId: line.inventoryItemId ?? null,
            taxAmount: '0',
            sortOrder: line.sortOrder ?? i,
          });
      }

      const totalAmount = computedTotal.toFixed(2);
      updateSet.totalAmount = totalAmount;
      updateSet.balanceDue = totalAmount;
      updateSet.amountPaid = '0'; // Still draft, no payments
    }

    // 4. Update bill header
    const [updated] = await tx
      .update(apBills)
      .set(updateSet)
      .where(eq(apBills.id, billId))
      .returning();

    // 5. Fetch updated lines
    const updatedLines = await tx
      .select()
      .from(apBillLines)
      .where(eq(apBillLines.billId, billId));

    return {
      result: { ...updated!, lines: updatedLines },
      events: [], // No events for draft updates
    };
  });

  await auditLog(ctx, 'ap.bill.updated', 'ap_bill', result.id);
  return result;
}

function mapLineType(lineType: string): string {
  if (lineType === 'item') return 'inventory';
  if (lineType === 'tax') return 'expense';
  if (lineType === 'other') return 'expense';
  return lineType;
}
