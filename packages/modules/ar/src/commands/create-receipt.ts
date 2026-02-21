import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arReceipts, arReceiptAllocations, arInvoices } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';

interface CreateReceiptInput {
  customerId: string;
  receiptDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  amount: string;
  bankAccountId?: string;
  sourceType: string;
  sourceReferenceId?: string;
  allocations: Array<{
    invoiceId: string;
    amountApplied: string;
  }>;
}

export async function createReceipt(ctx: RequestContext, input: CreateReceiptInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate allocations total doesn't exceed receipt amount
    const allocTotal = input.allocations.reduce((s, a) => s + Number(a.amountApplied), 0);
    if (allocTotal > Number(input.amount) + 0.01) {
      throw new AppError('ALLOCATION_EXCEEDS_RECEIPT', 'Allocation total exceeds receipt amount', 400);
    }

    // Validate each invoice exists and belongs to the same customer
    for (const alloc of input.allocations) {
      const [invoice] = await tx
        .select()
        .from(arInvoices)
        .where(and(eq(arInvoices.id, alloc.invoiceId), eq(arInvoices.tenantId, ctx.tenantId)))
        .limit(1);

      if (!invoice) throw new NotFoundError('Invoice', alloc.invoiceId);
      if (invoice.customerId !== input.customerId) {
        throw new AppError('INVOICE_CUSTOMER_MISMATCH', `Invoice ${alloc.invoiceId} belongs to a different customer`, 400);
      }
      if (Number(alloc.amountApplied) > Number(invoice.balanceDue) + 0.01) {
        throw new AppError('ALLOCATION_EXCEEDS_BALANCE', `Allocation $${alloc.amountApplied} exceeds invoice balance $${invoice.balanceDue}`, 400);
      }
    }

    const receiptId = generateUlid();

    const [receipt] = await tx
      .insert(arReceipts)
      .values({
        id: receiptId,
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        receiptDate: input.receiptDate,
        paymentMethod: input.paymentMethod ?? null,
        referenceNumber: input.referenceNumber ?? null,
        amount: input.amount,
        currency: 'USD',
        status: 'draft',
        bankAccountId: input.bankAccountId ?? null,
        sourceType: input.sourceType,
        sourceReferenceId: input.sourceReferenceId ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert allocations
    for (const alloc of input.allocations) {
      await tx.insert(arReceiptAllocations).values({
        receiptId,
        invoiceId: alloc.invoiceId,
        amountApplied: alloc.amountApplied,
      });
    }

    return { result: receipt!, events: [] };
  });

  await auditLog(ctx, 'ar.receipt.created', 'ar_receipt', result.id);
  return result;
}
