import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines, vendors } from '@oppsera/db';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { CreateBillInput } from '../validation';

export async function createBill(ctx: RequestContext, input: CreateBillInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate vendor exists and is active
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!vendor) {
      throw new NotFoundError('Vendor', input.vendorId);
    }

    if (!vendor.isActive) {
      throw new ValidationError('Vendor is inactive', [
        { field: 'vendorId', message: 'Vendor is inactive' },
      ]);
    }

    // 2. Compute total from lines
    let computedTotal = 0;
    for (const line of input.lines) {
      computedTotal += Number(line.amount);
    }
    const totalAmount = computedTotal.toFixed(2);

    // 3. Create bill
    const billId = generateUlid();
    const [bill] = await tx
      .insert(apBills)
      .values({
        id: billId,
        tenantId: ctx.tenantId,
        vendorId: input.vendorId,
        billNumber: input.billNumber,
        billDate: input.billDate,
        dueDate: input.dueDate,
        status: 'draft',
        memo: input.memo ?? null,
        locationId: input.locationId ?? null,
        paymentTermsId: input.paymentTermsId ?? null,
        vendorInvoiceNumber: input.vendorInvoiceNumber ?? null,
        currency: 'USD',
        totalAmount,
        amountPaid: '0',
        balanceDue: totalAmount,
        createdBy: ctx.user.id,
      })
      .returning();

    // 4. Insert bill lines
    const insertedLines = [];
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      const [inserted] = await tx
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
        })
        .returning();
      insertedLines.push(inserted!);
    }

    // Draft bills emit no GL event — only a domain event for tracking
    return {
      result: { ...bill!, lines: insertedLines },
      events: [], // No events for draft bills
    };
  });

  await auditLog(ctx, 'ap.bill.created', 'ap_bill', result.id);
  return result;
}

/**
 * Maps validation line types to DB line types.
 * Validation uses 'item' but DB schema uses 'inventory'.
 */
function mapLineType(lineType: string): string {
  if (lineType === 'item') return 'inventory';
  if (lineType === 'tax') return 'expense'; // tax lines map to expense
  if (lineType === 'other') return 'expense'; // other lines map to expense
  return lineType; // 'expense', 'freight' pass through
}
