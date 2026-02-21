import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apPayments, apPaymentAllocations, apBills, vendors, bankAccounts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { AP_EVENTS } from '../events/types';

export async function voidPayment(ctx: RequestContext, paymentId: string, reason: string) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load payment
    const [payment] = await tx
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.id, paymentId), eq(apPayments.tenantId, ctx.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment', paymentId);
    if (payment.status !== 'posted') {
      throw new AppError('PAYMENT_STATUS_ERROR', `Payment is ${payment.status}, expected posted`, 400);
    }

    // 2. Create GL reversal
    if (payment.glJournalEntryId) {
      // Resolve accounts same as post
      const [vendor] = await tx
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, payment.vendorId), eq(vendors.tenantId, ctx.tenantId)))
        .limit(1);

      let apControlAccountId = vendor?.defaultAPAccountId ?? null;
      if (!apControlAccountId) {
        const settings = await accountingApi.getSettings(ctx.tenantId);
        apControlAccountId = settings.defaultAPControlAccountId;
      }

      let bankGlAccountId: string | null = null;
      if (payment.bankAccountId) {
        const [bank] = await tx
          .select()
          .from(bankAccounts)
          .where(and(eq(bankAccounts.id, payment.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
          .limit(1);
        bankGlAccountId = bank?.glAccountId ?? null;
      }
      if (!bankGlAccountId && apControlAccountId) {
        bankGlAccountId = apControlAccountId;
      }

      if (apControlAccountId && bankGlAccountId) {
        await accountingApi.postEntry(ctx, {
          businessDate: payment.paymentDate,
          sourceModule: 'ap',
          sourceReferenceId: `void-${payment.id}`,
          memo: `Void AP Payment: ${reason}`,
          currency: payment.currency,
          lines: [
            // Reversed: Credit AP control, Debit Bank
            { accountId: apControlAccountId, debitAmount: '0', creditAmount: payment.amount, vendorId: payment.vendorId },
            { accountId: bankGlAccountId, debitAmount: payment.amount, creditAmount: '0', vendorId: payment.vendorId },
          ],
          forcePost: true,
        });
      }
    }

    // 3. Reverse bill allocations
    const allocations = await tx
      .select()
      .from(apPaymentAllocations)
      .where(eq(apPaymentAllocations.paymentId, paymentId));

    for (const alloc of allocations) {
      const [bill] = await tx
        .select()
        .from(apBills)
        .where(eq(apBills.id, alloc.billId))
        .limit(1);

      if (bill) {
        const restoredPaid = Math.max(0, Number(bill.amountPaid) - Number(alloc.amountApplied)).toFixed(2);
        const restoredBalance = (Number(bill.totalAmount) - Number(restoredPaid)).toFixed(2);
        const restoredStatus = Number(restoredPaid) === 0 ? 'posted' : 'partial';

        await tx
          .update(apBills)
          .set({
            amountPaid: restoredPaid,
            balanceDue: restoredBalance,
            status: restoredStatus,
            updatedAt: new Date(),
          })
          .where(eq(apBills.id, alloc.billId));
      }
    }

    // 4. Void the payment
    const [voided] = await tx
      .update(apPayments)
      .set({ status: 'voided', updatedAt: new Date() })
      .where(eq(apPayments.id, paymentId))
      .returning();

    const event = buildEventFromContext(ctx, AP_EVENTS.PAYMENT_VOIDED, {
      paymentId: payment.id,
      vendorId: payment.vendorId,
      amount: payment.amount,
      reason,
    });

    return { result: voided!, events: [event] };
  });

  await auditLog(ctx, 'ap.payment.voided', 'ap_payment', result.id);
  return result;
}
