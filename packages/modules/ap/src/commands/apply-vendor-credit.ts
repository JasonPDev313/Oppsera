import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills } from '@oppsera/db';
import { NotFoundError, ValidationError, AppError } from '@oppsera/shared';

interface ApplyVendorCreditInput {
  creditBillId: string; // The negative bill (credit memo)
  targetBillId: string; // The positive bill to apply against
  amount: string; // How much of the credit to apply
}

export async function applyVendorCredit(ctx: RequestContext, input: ApplyVendorCreditInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load credit bill
    const [credit] = await tx
      .select()
      .from(apBills)
      .where(and(eq(apBills.id, input.creditBillId), eq(apBills.tenantId, ctx.tenantId)))
      .limit(1);

    if (!credit) throw new NotFoundError('Credit Bill', input.creditBillId);
    if (Number(credit.totalAmount) >= 0) {
      throw new ValidationError('Bill is not a credit memo', [
        { field: 'creditBillId', message: 'Expected a negative bill (credit memo)' },
      ]);
    }

    // 2. Load target bill
    const [target] = await tx
      .select()
      .from(apBills)
      .where(and(eq(apBills.id, input.targetBillId), eq(apBills.tenantId, ctx.tenantId)))
      .limit(1);

    if (!target) throw new NotFoundError('Target Bill', input.targetBillId);
    if (!['posted', 'partial'].includes(target.status)) {
      throw new AppError('BILL_STATUS_ERROR', `Target bill is ${target.status}`, 400);
    }
    if (credit.vendorId !== target.vendorId) {
      throw new ValidationError('Credit and target bill must belong to same vendor', [
        { field: 'targetBillId', message: 'Vendor mismatch' },
      ]);
    }

    // 3. Validate amount
    const applyAmount = Number(input.amount);
    const availableCredit = Math.abs(Number(credit.balanceDue));
    if (applyAmount > availableCredit) {
      throw new ValidationError('Amount exceeds available credit', [
        { field: 'amount', message: `Available credit: $${availableCredit.toFixed(2)}` },
      ]);
    }
    if (applyAmount > Number(target.balanceDue)) {
      throw new ValidationError('Amount exceeds target bill balance', [
        { field: 'amount', message: `Target balance: $${target.balanceDue}` },
      ]);
    }

    // 4. Update target bill
    const newPaid = (Number(target.amountPaid) + applyAmount).toFixed(2);
    const newBalance = (Number(target.totalAmount) - Number(newPaid)).toFixed(2);
    const newStatus = Number(newBalance) <= 0 ? 'paid' : 'partial';

    await tx
      .update(apBills)
      .set({ amountPaid: newPaid, balanceDue: newBalance, status: newStatus, updatedAt: new Date() })
      .where(eq(apBills.id, input.targetBillId));

    // 5. Update credit bill balance (increase toward 0)
    const newCreditBalance = (Number(credit.balanceDue) + applyAmount).toFixed(2); // e.g. -100 + 50 = -50
    const creditStatus = Number(newCreditBalance) === 0 ? 'paid' : 'posted';

    await tx
      .update(apBills)
      .set({ balanceDue: newCreditBalance, status: creditStatus, updatedAt: new Date() })
      .where(eq(apBills.id, input.creditBillId));

    return {
      result: {
        creditBillId: input.creditBillId,
        targetBillId: input.targetBillId,
        amountApplied: input.amount,
        targetNewBalance: newBalance,
        creditNewBalance: newCreditBalance,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'ap.credit.applied', 'ap_bill', input.targetBillId);
  return result;
}
