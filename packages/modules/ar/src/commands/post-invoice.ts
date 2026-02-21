import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arInvoices, arInvoiceLines } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { InvoiceStatusError } from '../errors';
import { AR_EVENTS } from '../events/types';

interface PostInvoiceInput {
  invoiceId: string;
}

export async function postInvoice(ctx: RequestContext, input: PostInvoiceInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load invoice
    const [invoice] = await tx
      .select()
      .from(arInvoices)
      .where(and(eq(arInvoices.id, input.invoiceId), eq(arInvoices.tenantId, ctx.tenantId)))
      .limit(1);

    if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
    if (invoice.status !== 'draft') {
      throw new InvoiceStatusError(input.invoiceId, invoice.status, 'draft');
    }

    // 2. Idempotency: if invoice already has a GL entry, it was already posted
    if (invoice.glJournalEntryId) {
      return { result: invoice, events: [] };
    }

    // 3. Load lines
    const lines = await tx
      .select()
      .from(arInvoiceLines)
      .where(eq(arInvoiceLines.invoiceId, input.invoiceId));

    if (lines.length === 0) {
      throw new AppError('EMPTY_INVOICE', 'Cannot post an invoice with no lines', 400);
    }

    // 4. Resolve AR control account
    const settings = await accountingApi.getSettings(ctx.tenantId);
    const arControlAccountId = settings.defaultARControlAccountId;
    if (!arControlAccountId) {
      throw new AppError(
        'NO_AR_CONTROL_ACCOUNT',
        'No AR control account configured. Set a default in accounting settings.',
        400,
      );
    }

    // 5. Build GL lines
    const glLines: Array<{
      accountId: string;
      debitAmount?: string;
      creditAmount?: string;
      locationId?: string;
      customerId?: string;
      memo?: string;
    }> = [];

    // Debit AR control for total
    glLines.push({
      accountId: arControlAccountId,
      debitAmount: invoice.totalAmount,
      creditAmount: '0',
      customerId: invoice.customerId,
      locationId: invoice.locationId ?? undefined,
      memo: `AR Invoice ${invoice.invoiceNumber}`,
    });

    // Credit revenue accounts from lines
    for (const line of lines) {
      glLines.push({
        accountId: line.accountId,
        debitAmount: '0',
        creditAmount: line.amount,
        customerId: invoice.customerId,
        memo: line.description,
      });

      // If line has tax, credit tax payable
      // TODO: resolve tax account from tax group mapping when available
    }

    // 6. Post GL entry
    const glResult = await accountingApi.postEntry(ctx, {
      businessDate: invoice.invoiceDate,
      sourceModule: 'ar',
      sourceReferenceId: invoice.id,
      memo: `AR Invoice ${invoice.invoiceNumber}${invoice.memo ? ` - ${invoice.memo}` : ''}`,
      currency: invoice.currency,
      lines: glLines,
      forcePost: true,
    });

    // 7. Update invoice
    const [posted] = await tx
      .update(arInvoices)
      .set({
        status: 'posted',
        glJournalEntryId: glResult.id,
        updatedAt: new Date(),
      })
      .where(eq(arInvoices.id, input.invoiceId))
      .returning();

    const event = buildEventFromContext(ctx, AR_EVENTS.INVOICE_POSTED, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      glJournalEntryId: glResult.id,
    });

    return { result: posted!, events: [event] };
  });

  await auditLog(ctx, 'ar.invoice.posted', 'ar_invoice', result.id);
  return result;
}
