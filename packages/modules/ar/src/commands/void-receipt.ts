import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arReceipts, arReceiptAllocations, arInvoices, bankAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { ReceiptStatusError } from '../errors';
import { AR_EVENTS } from '../events/types';

interface VoidReceiptInput {
  receiptId: string;
  reason: string;
  clientRequestId?: string;
}

export async function voidReceipt(ctx: RequestContext, input: VoidReceiptInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidReceipt');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [receipt] = await tx
      .select()
      .from(arReceipts)
      .where(and(eq(arReceipts.id, input.receiptId), eq(arReceipts.tenantId, ctx.tenantId)))
      .limit(1);

    if (!receipt) throw new NotFoundError('Receipt', input.receiptId);
    if (receipt.status !== 'posted') {
      throw new ReceiptStatusError(input.receiptId, receipt.status, 'posted');
    }

    // Reverse GL if posted
    let reversalJournalEntryId: string | null = null;
    if (receipt.glJournalEntryId) {
      const settings = await accountingApi.getSettings(ctx.tenantId);
      const arControlAccountId = settings.defaultARControlAccountId;

      let bankGlAccountId: string | null = null;
      if (receipt.bankAccountId) {
        const [bank] = await tx
          .select()
          .from(bankAccounts)
          .where(and(eq(bankAccounts.id, receipt.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
          .limit(1);
        bankGlAccountId = bank?.glAccountId ?? null;
      }

      if (arControlAccountId && bankGlAccountId) {
        const glResult = await accountingApi.postEntry(ctx, {
          businessDate: receipt.receiptDate,
          sourceModule: 'ar',
          sourceReferenceId: `void-${receipt.id}`,
          memo: `Void AR Receipt: ${input.reason}`,
          currency: receipt.currency,
          lines: [
            {
              accountId: arControlAccountId,
              debitAmount: receipt.amount,
              creditAmount: '0',
              customerId: receipt.customerId,
              memo: `Void receipt reversal`,
            },
            {
              accountId: bankGlAccountId,
              debitAmount: '0',
              creditAmount: receipt.amount,
              customerId: receipt.customerId,
              memo: `Void receipt reversal`,
            },
          ],
          forcePost: true,
        });
        reversalJournalEntryId = glResult.id;
      }
    }

    // Restore invoice allocations
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

      if (invoice) {
        const restoredPaid = Math.max(0, Number(invoice.amountPaid) - Number(alloc.amountApplied)).toFixed(2);
        const restoredBalance = (Number(invoice.totalAmount) - Number(restoredPaid)).toFixed(2);
        const restoredStatus = Number(restoredPaid) === 0 ? 'posted' : 'partial';

        await tx
          .update(arInvoices)
          .set({
            amountPaid: restoredPaid,
            balanceDue: restoredBalance,
            status: restoredStatus,
            updatedAt: new Date(),
          })
          .where(eq(arInvoices.id, alloc.invoiceId));
      }
    }

    const [voided] = await tx
      .update(arReceipts)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: ctx.user.id,
        voidReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(arReceipts.id, input.receiptId))
      .returning();

    const event = buildEventFromContext(ctx, AR_EVENTS.RECEIPT_VOIDED, {
      receiptId: receipt.id,
      customerId: receipt.customerId,
      amount: receipt.amount,
      reason: input.reason,
    });

    const voidedResult = { ...voided!, reversalJournalEntryId };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidReceipt', voidedResult);
    return { result: voidedResult, events: [event] };
  });

  await auditLog(ctx, 'ar.receipt.voided', 'ar_receipt', result.id);
  return result;
}
