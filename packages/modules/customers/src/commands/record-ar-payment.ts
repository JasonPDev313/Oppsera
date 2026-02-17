import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { billingAccounts, arTransactions, arAllocations, statements, customerActivityLog, paymentJournalEntries } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { RecordArPaymentInput } from '../validation';

export async function recordArPayment(ctx: RequestContext, input: RecordArPaymentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify billing account
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);

    // Create payment AR transaction (negative amount reduces balance)
    const [paymentTx] = await (tx as any).insert(arTransactions).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.billingAccountId,
      type: 'payment',
      amountCents: -input.amountCents, // negative
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    }).returning();

    // GL entry: Dr Cash / Cr AR
    const [glEntry] = await (tx as any).insert(paymentJournalEntries).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? 'system',
      referenceType: 'ar_payment',
      referenceId: paymentTx!.id,
      orderId: '',
      entries: [
        { accountCode: '1010', accountName: 'Cash on Hand', debit: input.amountCents, credit: 0 },
        { accountCode: account.glArAccountCode, accountName: 'Accounts Receivable', debit: 0, credit: input.amountCents },
      ],
      businessDate: new Date().toISOString().split('T')[0]!,
      sourceModule: 'billing',
      glDimensions: ctx.locationId ? { locationId: ctx.locationId } : null,
      recognitionStatus: 'recognized',
    }).returning();

    await (tx as any).update(arTransactions).set({ glJournalEntryId: glEntry!.id })
      .where(eq(arTransactions.id, paymentTx!.id));

    // Auto-allocate to outstanding charges (FIFO by dueDate)
    const outstandingCharges = await (tx as any).select().from(arTransactions)
      .where(and(
        eq(arTransactions.tenantId, ctx.tenantId),
        eq(arTransactions.billingAccountId, input.billingAccountId),
        eq(arTransactions.type, 'charge'),
      ))
      .orderBy(arTransactions.dueDate);

    // For each charge, compute how much has already been allocated
    const allocations: Array<{ chargeTransactionId: string; amountCents: number }> = [];
    let remaining = input.amountCents;

    for (const charge of outstandingCharges) {
      if (remaining <= 0) break;

      // Sum existing allocations for this charge
      const existingAllocs = await (tx as any).select({
        total: sql`COALESCE(SUM(${arAllocations.amountCents}), 0)`,
      }).from(arAllocations)
        .where(and(
          eq(arAllocations.tenantId, ctx.tenantId),
          eq(arAllocations.chargeTransactionId, charge.id),
        ));
      const allocatedTotal = Number(existingAllocs[0]?.total ?? 0);
      const unallocated = Number(charge.amountCents) - allocatedTotal;

      if (unallocated <= 0) continue;

      const allocateAmount = Math.min(remaining, unallocated);

      await (tx as any).insert(arAllocations).values({
        tenantId: ctx.tenantId,
        paymentTransactionId: paymentTx!.id,
        chargeTransactionId: charge.id,
        amountCents: allocateAmount,
      });

      allocations.push({ chargeTransactionId: charge.id, amountCents: allocateAmount });
      remaining -= allocateAmount;
    }

    // Update cached balance
    const newBalance = Number(account.currentBalanceCents) - input.amountCents;
    await (tx as any).update(billingAccounts).set({
      currentBalanceCents: newBalance,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.billingAccountId));

    // Check if any open statements can be marked 'paid'
    const openStatements = await (tx as any).select().from(statements)
      .where(and(
        eq(statements.tenantId, ctx.tenantId),
        eq(statements.billingAccountId, input.billingAccountId),
        eq(statements.status, 'open'),
      ));
    for (const stmt of openStatements) {
      if (newBalance <= 0) {
        await (tx as any).update(statements).set({ status: 'paid' })
          .where(eq(statements.id, stmt.id));
      }
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'payment_received',
      title: `Payment received: ${input.amountCents} cents`,
      metadata: { arTransactionId: paymentTx!.id, amount: input.amountCents, allocations },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'ar.payment.created.v1', {
      transactionId: paymentTx!.id,
      billingAccountId: input.billingAccountId,
      amountCents: input.amountCents,
      newBalance,
      allocations,
    });

    return { result: { ...paymentTx!, newBalance, allocations }, events: [event] };
  });

  await auditLog(ctx, 'ar.payment.created', 'ar_transaction', result.id);
  return result;
}
