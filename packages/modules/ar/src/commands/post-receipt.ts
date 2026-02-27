import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arReceipts, arReceiptAllocations, arInvoices, bankAccounts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { ReceiptStatusError } from '../errors';
import { AR_EVENTS } from '../events/types';

interface PostReceiptInput {
  receiptId: string;
  clientRequestId?: string;
}

export async function postReceipt(ctx: RequestContext, input: PostReceiptInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'postReceipt');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [receipt] = await tx
      .select()
      .from(arReceipts)
      .where(and(eq(arReceipts.id, input.receiptId), eq(arReceipts.tenantId, ctx.tenantId)))
      .limit(1);

    if (!receipt) throw new NotFoundError('Receipt', input.receiptId);
    if (receipt.status !== 'draft') {
      throw new ReceiptStatusError(input.receiptId, receipt.status, 'draft');
    }

    // Idempotency: if receipt already has a GL entry, it was already posted
    if (receipt.glJournalEntryId) {
      return { result: receipt, events: [] };
    }

    // Resolve AR control + bank account
    const settings = await accountingApi.getSettings(ctx.tenantId);
    const arControlAccountId = settings.defaultARControlAccountId;
    if (!arControlAccountId) {
      throw new AppError(
        'NO_AR_CONTROL_ACCOUNT',
        'No AR control account configured. Set a default in accounting settings.',
        400,
      );
    }

    let bankGlAccountId: string | null = null;
    if (receipt.bankAccountId) {
      const [bank] = await tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, receipt.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
        .limit(1);
      bankGlAccountId = bank?.glAccountId ?? null;
    }

    if (!bankGlAccountId) {
      throw new AppError(
        'NO_BANK_GL_MAPPING',
        'No bank account GL mapping found. Assign a bank account with a linked GL account.',
        400,
      );
    }

    // Post GL: Dr Bank, Cr AR Control
    const glResult = await accountingApi.postEntry(ctx, {
      businessDate: receipt.receiptDate,
      sourceModule: 'ar',
      sourceReferenceId: receipt.id,
      memo: `AR Receipt from customer${receipt.referenceNumber ? ` (ref: ${receipt.referenceNumber})` : ''}`,
      currency: receipt.currency,
      lines: [
        {
          accountId: bankGlAccountId,
          debitAmount: receipt.amount,
          creditAmount: '0',
          customerId: receipt.customerId,
          memo: `AR receipt ${receipt.paymentMethod ?? ''}`.trim(),
        },
        {
          accountId: arControlAccountId,
          debitAmount: '0',
          creditAmount: receipt.amount,
          customerId: receipt.customerId,
          memo: 'AR receipt payment',
        },
      ],
      forcePost: true,
    });

    // Update receipt
    const [posted] = await tx
      .update(arReceipts)
      .set({
        status: 'posted',
        glJournalEntryId: glResult.id,
        updatedAt: new Date(),
      })
      .where(eq(arReceipts.id, input.receiptId))
      .returning();

    // Update allocated invoices
    const allocations = await tx
      .select()
      .from(arReceiptAllocations)
      .where(eq(arReceiptAllocations.receiptId, input.receiptId));

    for (const alloc of allocations) {
      const [invoice] = await tx
        .select()
        .from(arInvoices)
        .where(eq(arInvoices.id, alloc.invoiceId))
        .limit(1);

      if (!invoice) {
        throw new AppError(
          'INVOICE_NOT_FOUND',
          `Receipt allocation references non-existent invoice ${alloc.invoiceId}`,
          400,
        );
      }

      {
        const newPaid = (Number(invoice.amountPaid) + Number(alloc.amountApplied)).toFixed(2);
        const newBalance = (Number(invoice.totalAmount) - Number(newPaid)).toFixed(2);
        const newStatus = Number(newBalance) <= 0 ? 'paid' : 'partial';

        await tx
          .update(arInvoices)
          .set({
            amountPaid: newPaid,
            balanceDue: newBalance,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(arInvoices.id, alloc.invoiceId));
      }
    }

    const event = buildEventFromContext(ctx, AR_EVENTS.RECEIPT_POSTED, {
      receiptId: receipt.id,
      customerId: receipt.customerId,
      amount: receipt.amount,
      glJournalEntryId: glResult.id,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'postReceipt', posted!);
    return { result: posted!, events: [event] };
  });

  await auditLog(ctx, 'ar.receipt.posted', 'ar_receipt', result.id);
  return result;
}
