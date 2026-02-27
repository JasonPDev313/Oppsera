import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apPayments, apPaymentAllocations, apBills, vendors, bankAccounts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { AP_EVENTS } from '../events/types';

export async function postPayment(ctx: RequestContext, paymentId: string, clientRequestId?: string) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'postPayment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Load payment
    const [payment] = await tx
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.id, paymentId), eq(apPayments.tenantId, ctx.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment', paymentId);
    if (payment.status !== 'draft') {
      throw new AppError('PAYMENT_STATUS_ERROR', `Payment is ${payment.status}, expected draft`, 400);
    }

    // Idempotency
    if (payment.glJournalEntryId) {
      return { result: payment, events: [] };
    }

    // 2. Resolve AP control account
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
    if (!apControlAccountId) {
      throw new AppError('NO_AP_CONTROL_ACCOUNT', 'No AP control account configured', 400);
    }

    // 3. Resolve bank/cash account
    let bankGlAccountId: string | null = null;
    if (payment.bankAccountId) {
      const [bank] = await tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, payment.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
        .limit(1);
      bankGlAccountId = bank?.glAccountId ?? null;
    }
    if (!bankGlAccountId) {
      await accountingApi.getSettings(ctx.tenantId);
      // Use AP control as fallback if no bank — though this is a config error
      bankGlAccountId = apControlAccountId;
    }

    // 4. Post GL: Debit AP control, Credit Bank
    const glResult = await accountingApi.postEntry(ctx, {
      businessDate: payment.paymentDate,
      sourceModule: 'ap',
      sourceReferenceId: payment.id,
      memo: `AP Payment to ${vendor?.name ?? 'vendor'}${payment.referenceNumber ? ` (${payment.referenceNumber})` : ''}`,
      currency: payment.currency,
      lines: [
        { accountId: apControlAccountId, debitAmount: payment.amount, creditAmount: '0', vendorId: payment.vendorId },
        { accountId: bankGlAccountId, debitAmount: '0', creditAmount: payment.amount, vendorId: payment.vendorId },
      ],
      forcePost: true,
    });

    // 5. Update payment status
    const [posted] = await tx
      .update(apPayments)
      .set({ status: 'posted', glJournalEntryId: glResult.id, updatedAt: new Date() })
      .where(eq(apPayments.id, paymentId))
      .returning();

    // 6. Update bill amountPaid and balanceDue for each allocation
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
        const newPaid = (Number(bill.amountPaid) + Number(alloc.amountApplied)).toFixed(2);
        const newBalance = (Number(bill.totalAmount) - Number(newPaid)).toFixed(2);
        const newStatus = Number(newBalance) <= 0 ? 'paid' : 'partial';

        await tx
          .update(apBills)
          .set({
            amountPaid: newPaid,
            balanceDue: newBalance,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(apBills.id, alloc.billId));
      }
    }

    const event = buildEventFromContext(ctx, AP_EVENTS.PAYMENT_POSTED, {
      paymentId: payment.id,
      vendorId: payment.vendorId,
      amount: payment.amount,
      glJournalEntryId: glResult.id,
    });

    const resultPayload = { ...posted!, glJournalEntryId: glResult.id };
    await saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'postPayment', resultPayload);

    return { result: resultPayload, events: [event] };
  });

  await auditLog(ctx, 'ap.payment.posted', 'ap_payment', result.id);
  return result;
}
