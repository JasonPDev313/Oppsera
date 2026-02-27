import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apPayments, apPaymentAllocations, apBills, vendors } from '@oppsera/db';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { CreatePaymentInput } from '../validation';

export async function createPayment(ctx: RequestContext, input: CreatePaymentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createPayment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Validate vendor exists
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, input.vendorId), eq(vendors.tenantId, ctx.tenantId)))
      .limit(1);
    if (!vendor) throw new NotFoundError('Vendor', input.vendorId);

    // 2. Validate each allocation: bill exists, belongs to same vendor, has sufficient balance
    for (const alloc of input.allocations) {
      const [bill] = await tx
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, alloc.billId), eq(apBills.tenantId, ctx.tenantId)))
        .limit(1);

      if (!bill) throw new NotFoundError('Bill', alloc.billId);
      if (bill.vendorId !== input.vendorId) {
        throw new ValidationError('Bill does not belong to this vendor', [
          { field: 'allocations', message: `Bill ${alloc.billId} belongs to a different vendor` },
        ]);
      }
      if (!['posted', 'partial'].includes(bill.status)) {
        throw new ValidationError('Bill must be posted or partial', [
          { field: 'allocations', message: `Bill ${alloc.billId} has status ${bill.status}` },
        ]);
      }
      if (Number(alloc.amount) > Number(bill.balanceDue)) {
        throw new ValidationError('Allocation exceeds bill balance', [
          {
            field: 'allocations',
            message: `Bill ${alloc.billId} has balance $${bill.balanceDue}, allocation is $${alloc.amount}`,
          },
        ]);
      }
    }

    // 3. Create payment
    const paymentId = generateUlid();
    const [payment] = await tx
      .insert(apPayments)
      .values({
        id: paymentId,
        tenantId: ctx.tenantId,
        vendorId: input.vendorId,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod ?? null,
        bankAccountId: input.bankAccountId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        amount: input.amount,
        currency: 'USD',
        status: 'draft',
        memo: input.memo ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    // 4. Create allocations
    for (const alloc of input.allocations) {
      await tx.insert(apPaymentAllocations).values({
        paymentId,
        billId: alloc.billId,
        amountApplied: alloc.amount,
      });
    }

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createPayment', payment!);

    return { result: payment!, events: [] };
  });

  await auditLog(ctx, 'ap.payment.created', 'ap_payment', result.id);
  return result;
}
