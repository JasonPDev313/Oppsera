import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, arTransactions, customerActivityLog, paymentJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RecordArTransactionInput } from '../validation';
import { checkCreditLimit } from '../helpers/credit-limit';

export async function recordArTransaction(ctx: RequestContext, input: RecordArTransactionInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify billing account
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);

    // For charges: verify account is active
    if (input.type === 'charge') {
      if (account.status !== 'active') {
        throw new ValidationError('Cannot charge to a non-active billing account');
      }
      // Check credit limit
      checkCreditLimit(account, input.amountCents);
    }

    // Compute due date for charges
    let dueDate: string | null = null;
    if (input.dueDate) {
      dueDate = input.dueDate;
    } else if (input.type === 'charge') {
      const d = new Date();
      d.setDate(d.getDate() + account.dueDays);
      dueDate = d.toISOString().split('T')[0]!;
    }

    // Create AR transaction
    const [arTx] = await (tx as any).insert(arTransactions).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.billingAccountId,
      type: input.type,
      amountCents: input.amountCents,
      dueDate,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      customerId: input.customerId ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    }).returning();

    // Generate GL journal entry
    const glEntries = buildGlEntries(input.type, input.amountCents, account.glArAccountCode);
    if (glEntries.length > 0) {
      const [glEntry] = await (tx as any).insert(paymentJournalEntries).values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId ?? 'system',
        referenceType: 'ar_transaction',
        referenceId: arTx!.id,
        orderId: input.referenceType === 'order' ? input.referenceId ?? '' : '',
        entries: glEntries,
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'billing',
        glDimensions: ctx.locationId ? { locationId: ctx.locationId } : null,
        recognitionStatus: 'recognized',
      }).returning();

      // Update AR transaction with GL reference
      await (tx as any).update(arTransactions).set({ glJournalEntryId: glEntry!.id })
        .where(eq(arTransactions.id, arTx!.id));
    }

    // Update cached balance
    const newBalance = Number(account.currentBalanceCents) + input.amountCents;
    await (tx as any).update(billingAccounts).set({
      currentBalanceCents: newBalance,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.billingAccountId));

    // Activity log on primary customer
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: input.type === 'charge' ? 'system' : input.type === 'payment' ? 'payment_received' : 'adjustment',
      title: `AR ${input.type}: ${input.amountCents > 0 ? '+' : ''}${input.amountCents} cents`,
      metadata: { arTransactionId: arTx!.id, type: input.type, amount: input.amountCents },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, `ar.${input.type === 'charge' ? 'charge' : input.type === 'writeoff' ? 'adjustment' : input.type}.created.v1`, {
      transactionId: arTx!.id,
      billingAccountId: input.billingAccountId,
      type: input.type,
      amountCents: input.amountCents,
      newBalance,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      customerId: input.customerId,
    });

    return { result: { ...arTx!, newBalance }, events: [event] };
  });

  await auditLog(ctx, `ar.${input.type}.created`, 'ar_transaction', result.id);
  return result;
}

function buildGlEntries(type: string, amountCents: number, arAccountCode: string) {
  const absAmount = Math.abs(amountCents);
  switch (type) {
    case 'charge':
      return [
        { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: absAmount, credit: 0 },
        { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: absAmount },
      ];
    case 'payment':
      return [
        { accountCode: '1010', accountName: 'Cash on Hand', debit: absAmount, credit: 0 },
        { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: 0, credit: absAmount },
      ];
    case 'adjustment':
      if (amountCents < 0) {
        return [
          { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: 0, credit: absAmount },
          { accountCode: '4000', accountName: 'Revenue Adjustment', debit: absAmount, credit: 0 },
        ];
      }
      return [
        { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: absAmount, credit: 0 },
        { accountCode: '4000', accountName: 'Revenue Adjustment', debit: 0, credit: absAmount },
      ];
    case 'writeoff':
      return [
        { accountCode: '6100', accountName: 'Bad Debt Expense', debit: absAmount, credit: 0 },
        { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: 0, credit: absAmount },
      ];
    case 'late_fee':
      return [
        { accountCode: arAccountCode, accountName: 'Accounts Receivable', debit: absAmount, credit: 0 },
        { accountCode: '4600', accountName: 'Late Fee Revenue', debit: 0, credit: absAmount },
      ];
    default:
      return [];
  }
}
