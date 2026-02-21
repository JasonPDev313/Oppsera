import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apPayments, apPaymentAllocations, apBills } from '@oppsera/db';
import { NotFoundError, ValidationError, AppError } from '@oppsera/shared';
import type { PaymentAllocationInput } from '../validation';

export async function allocatePayment(
  ctx: RequestContext,
  paymentId: string,
  allocations: PaymentAllocationInput[],
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load payment — must be draft
    const [payment] = await tx
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.id, paymentId), eq(apPayments.tenantId, ctx.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment', paymentId);
    if (payment.status !== 'draft') {
      throw new AppError(
        'PAYMENT_STATUS_ERROR',
        `Payment is ${payment.status}, only draft payments can be re-allocated`,
        400,
      );
    }

    // 2. Validate allocations
    for (const alloc of allocations) {
      const [bill] = await tx
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, alloc.billId), eq(apBills.tenantId, ctx.tenantId)))
        .limit(1);

      if (!bill) throw new NotFoundError('Bill', alloc.billId);
      if (bill.vendorId !== payment.vendorId) {
        throw new ValidationError('Bill does not belong to payment vendor', [
          { field: 'allocations', message: `Bill ${alloc.billId} belongs to a different vendor` },
        ]);
      }
    }

    // 3. Delete old allocations
    const existing = await tx
      .select({ paymentId: apPaymentAllocations.paymentId, billId: apPaymentAllocations.billId })
      .from(apPaymentAllocations)
      .where(eq(apPaymentAllocations.paymentId, paymentId));

    for (const row of existing) {
      await tx
        .delete(apPaymentAllocations)
        .where(
          and(
            eq(apPaymentAllocations.paymentId, row.paymentId),
            eq(apPaymentAllocations.billId, row.billId),
          ),
        );
    }

    // 4. Insert new allocations
    for (const alloc of allocations) {
      await tx.insert(apPaymentAllocations).values({
        paymentId,
        billId: alloc.billId,
        amountApplied: alloc.amount,
      });
    }

    return { result: payment, events: [] };
  });

  await auditLog(ctx, 'ap.payment.reallocated', 'ap_payment', result.id);
  return result;
}
