import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arInvoices, arInvoiceLines, arReceiptAllocations } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { AR_EVENTS } from '../events/types';

interface VoidInvoiceInput {
  invoiceId: string;
  reason: string;
  clientRequestId?: string;
}

export async function voidInvoice(ctx: RequestContext, input: VoidInvoiceInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidInvoice');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [invoice] = await tx
      .select()
      .from(arInvoices)
      .where(and(eq(arInvoices.id, input.invoiceId), eq(arInvoices.tenantId, ctx.tenantId)))
      .limit(1);

    if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
    if (invoice.status !== 'posted' && invoice.status !== 'partial') {
      throw new AppError('INVOICE_STATUS_ERROR', `Invoice must be posted or partial to void, current: ${invoice.status}`, 400);
    }

    // Check for allocations
    const allocations = await tx
      .select()
      .from(arReceiptAllocations)
      .where(eq(arReceiptAllocations.invoiceId, input.invoiceId));

    if (allocations.length > 0) {
      throw new AppError('INVOICE_HAS_RECEIPTS', 'Cannot void invoice with receipt allocations', 400);
    }

    // Reverse GL if posted
    let reversalJournalEntryId: string | null = null;
    if (invoice.glJournalEntryId) {
      const lines = await tx
        .select()
        .from(arInvoiceLines)
        .where(eq(arInvoiceLines.invoiceId, input.invoiceId));

      const settings = await accountingApi.getSettings(ctx.tenantId);
      const arControlAccountId = settings.defaultARControlAccountId;

      if (arControlAccountId) {
        const reversedGlLines: Array<{
          accountId: string;
          debitAmount?: string;
          creditAmount?: string;
          locationId?: string;
          customerId?: string;
          memo?: string;
        }> = [];

        // Reverse: Credit AR control
        reversedGlLines.push({
          accountId: arControlAccountId,
          debitAmount: '0',
          creditAmount: invoice.totalAmount,
          customerId: invoice.customerId,
          locationId: invoice.locationId ?? undefined,
          memo: `Void AR Invoice ${invoice.invoiceNumber}: ${input.reason}`,
        });

        // Reverse: Debit revenue accounts
        for (const line of lines) {
          reversedGlLines.push({
            accountId: line.accountId,
            debitAmount: line.amount,
            creditAmount: '0',
            customerId: invoice.customerId,
            memo: `Void reversal: ${line.description}`,
          });
        }

        const glResult = await accountingApi.postEntry(ctx, {
          businessDate: invoice.invoiceDate,
          sourceModule: 'ar',
          sourceReferenceId: `void-${invoice.id}`,
          memo: `Void AR Invoice ${invoice.invoiceNumber}: ${input.reason}`,
          currency: invoice.currency,
          lines: reversedGlLines,
          forcePost: true,
        });

        reversalJournalEntryId = glResult.id;
      }
    }

    const [voided] = await tx
      .update(arInvoices)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: ctx.user.id,
        voidReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(arInvoices.id, input.invoiceId))
      .returning();

    const event = buildEventFromContext(ctx, AR_EVENTS.INVOICE_VOIDED, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      reason: input.reason,
    });

    const voidedResult = { ...voided!, reversalJournalEntryId };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidInvoice', voidedResult);
    return { result: voidedResult, events: [event] };
  });

  await auditLog(ctx, 'ar.invoice.voided', 'ar_invoice', result.id);
  return result;
}
