import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  apBills,
  apBillLines,
  vendors,
  receivingReceipts,
  receivingReceiptLines,
} from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';

interface CreateBillFromReceiptInput {
  receiptId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  memo?: string;
  /** GL account for inventory line items. Required if receipt has inventory lines. */
  inventoryAccountId: string;
  /** GL account for freight/shipping charges. Required if receipt has shipping cost. */
  freightAccountId?: string;
  clientRequestId?: string;
}

export async function createBillFromReceipt(
  ctx: RequestContext,
  input: CreateBillFromReceiptInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createBillFromReceipt');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Load receipt
    const [receipt] = await tx
      .select()
      .from(receivingReceipts)
      .where(
        and(
          eq(receivingReceipts.id, input.receiptId),
          eq(receivingReceipts.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!receipt) {
      throw new NotFoundError('Receiving Receipt', input.receiptId);
    }

    if (receipt.status !== 'posted') {
      throw new AppError(
        'RECEIPT_NOT_POSTED',
        `Receipt ${input.receiptId} must be posted before creating a bill`,
        400,
      );
    }

    // 2. Load vendor
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, receipt.vendorId),
          eq(vendors.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!vendor) {
      throw new NotFoundError('Vendor', receipt.vendorId);
    }

    // 3. Load receipt lines
    const receiptLines = await tx
      .select()
      .from(receivingReceiptLines)
      .where(eq(receivingReceiptLines.receiptId, input.receiptId));

    if (receiptLines.length === 0) {
      throw new AppError('EMPTY_RECEIPT', 'Receipt has no lines', 400);
    }

    // 4. Map receipt lines to bill lines
    const billLines: Array<{
      id: string;
      tenantId: string;
      billId: string;
      lineType: string;
      accountId: string;
      description: string | null;
      quantity: string;
      unitCost: string;
      amount: string;
      locationId: string | null;
      departmentId: string | null;
      inventoryItemId: string | null;
      taxAmount: string;
      sortOrder: number;
    }> = [];

    const billId = generateUlid();
    let subtotal = 0;

    for (let i = 0; i < receiptLines.length; i++) {
      const rl = receiptLines[i]!;
      const lineAmount = Number(rl.extendedCost);
      subtotal += lineAmount;

      // Determine the account: use vendor's default expense account or the provided inventory account
      const accountId = vendor.defaultExpenseAccountId ?? input.inventoryAccountId;

      billLines.push({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        billId,
        lineType: 'inventory',
        accountId,
        description: null, // Could be enriched with item name if needed
        quantity: rl.quantityReceived,
        unitCost: rl.unitCost,
        amount: lineAmount.toFixed(2),
        locationId: receipt.locationId ?? null,
        departmentId: null,
        inventoryItemId: rl.inventoryItemId,
        taxAmount: '0',
        sortOrder: i,
      });
    }

    // 5. Add freight line if receipt has shipping cost
    const shippingCost = Number(receipt.shippingCost);
    if (shippingCost > 0 && input.freightAccountId) {
      subtotal += shippingCost;

      billLines.push({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        billId,
        lineType: 'freight',
        accountId: input.freightAccountId,
        description: 'Freight / Shipping',
        quantity: '1',
        unitCost: shippingCost.toFixed(4),
        amount: shippingCost.toFixed(2),
        locationId: receipt.locationId ?? null,
        departmentId: null,
        inventoryItemId: null,
        taxAmount: '0',
        sortOrder: receiptLines.length,
      });
    }

    // 6. Add tax if receipt has tax amount
    const taxAmount = Number(receipt.taxAmount);
    if (taxAmount > 0) {
      subtotal += taxAmount;
    }

    const totalAmount = subtotal.toFixed(2);

    // 7. Create bill
    const [bill] = await tx
      .insert(apBills)
      .values({
        id: billId,
        tenantId: ctx.tenantId,
        vendorId: receipt.vendorId,
        billNumber: input.billNumber,
        billDate: input.billDate,
        dueDate: input.dueDate,
        status: 'draft',
        memo: input.memo ?? `From Receipt ${receipt.receiptNumber}`,
        locationId: receipt.locationId,
        currency: 'USD',
        totalAmount,
        amountPaid: '0',
        balanceDue: totalAmount,
        receivingReceiptId: receipt.id,
        createdBy: ctx.user.id,
      })
      .returning();

    // 8. Insert bill lines
    for (const line of billLines) {
      await tx.insert(apBillLines).values(line);
    }

    const billResult = { ...bill!, lines: billLines };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createBillFromReceipt', billResult);
    return {
      result: billResult,
      events: [], // Draft bill — no events
    };
  });

  await auditLog(ctx, 'ap.bill.created_from_receipt', 'ap_bill', result.id);
  return result;
}
