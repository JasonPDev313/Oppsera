import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines, apPaymentAllocations, vendors } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { BillStatusError, BillHasPaymentsError } from '../errors';
import { AP_EVENTS } from '../events/types';
import type { VoidBillInput } from '../validation';

export async function voidBill(ctx: RequestContext, input: VoidBillInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load bill
    const [bill] = await tx
      .select()
      .from(apBills)
      .where(
        and(
          eq(apBills.id, input.billId),
          eq(apBills.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw new NotFoundError('Bill', input.billId);
    }

    // Only posted or partial bills can be voided
    if (bill.status !== 'posted' && bill.status !== 'partial') {
      throw new BillStatusError(input.billId, bill.status, 'posted or partial');
    }

    // 2. Check for non-voided payment allocations
    const allocations = await tx
      .select({ paymentId: apPaymentAllocations.paymentId })
      .from(apPaymentAllocations)
      .where(eq(apPaymentAllocations.billId, input.billId));

    if (allocations.length > 0) {
      throw new BillHasPaymentsError(input.billId);
    }

    // 3. If the bill has a GL entry, create a reversal
    let reversalJournalEntryId: string | null = null;
    if (bill.glJournalEntryId) {
      // Load original bill lines for reversal
      const lines = await tx
        .select()
        .from(apBillLines)
        .where(eq(apBillLines.billId, input.billId));

      // Build reversed GL lines (credits become debits, debits become credits)
      // Original: Debit expense accounts, Credit AP control
      // Reversal: Credit expense accounts, Debit AP control
      const reversedGlLines: Array<{
        accountId: string;
        debitAmount?: string;
        creditAmount?: string;
        vendorId?: string;
        memo?: string;
      }> = [];

      for (const line of lines) {
        reversedGlLines.push({
          accountId: line.accountId,
          debitAmount: '0',
          creditAmount: line.amount,
          vendorId: bill.vendorId,
          memo: `Void reversal: ${line.description ?? ''}`,
        });
      }

      // Debit AP control for the total (reverses the original credit)
      // We need to figure out the AP control account — read from original journal
      // Since we can't easily read GL lines from here, we reverse using the total
      // and resolve the AP control account the same way as post-bill
      let apControlAccountId: string | null = null;
      const [vendor] = await tx
        .select()
        .from(vendors)
        .where(
          and(
            eq(vendors.id, bill.vendorId),
            eq(vendors.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      apControlAccountId = vendor?.defaultAPAccountId ?? null;

      if (!apControlAccountId) {
        const settings = await accountingApi.getSettings(ctx.tenantId);
        apControlAccountId = settings.defaultAPControlAccountId;
      }

      if (apControlAccountId) {
        reversedGlLines.push({
          accountId: apControlAccountId,
          debitAmount: bill.totalAmount,
          creditAmount: '0',
          vendorId: bill.vendorId,
          memo: `Void AP Bill ${bill.billNumber}: ${input.reason}`,
        });

        const glResult = await accountingApi.postEntry(ctx, {
          businessDate: bill.billDate,
          sourceModule: 'ap',
          sourceReferenceId: `void-${bill.id}`,
          memo: `Void AP Bill ${bill.billNumber}: ${input.reason}`,
          currency: bill.currency,
          lines: reversedGlLines,
          forcePost: true,
        });

        reversalJournalEntryId = glResult.id;
      }
    }

    // 4. Update bill status to voided
    const [voided] = await tx
      .update(apBills)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: ctx.user.id,
        voidReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(apBills.id, input.billId))
      .returning();

    // 5. Emit void event
    const event = buildEventFromContext(ctx, AP_EVENTS.BILL_VOIDED, {
      billId: bill.id,
      vendorId: bill.vendorId,
      billNumber: bill.billNumber,
      totalAmount: bill.totalAmount,
      reason: input.reason,
      reversalJournalEntryId,
    });

    return {
      result: { ...voided!, reversalJournalEntryId },
      events: [event],
    };
  });

  await auditLog(ctx, 'ap.bill.voided', 'ap_bill', result.id);
  return result;
}
