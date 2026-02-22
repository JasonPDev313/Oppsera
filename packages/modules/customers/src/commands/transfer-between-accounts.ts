import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, arTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { TransferBetweenAccountsInput } from '../validation';

export async function transferBetweenAccounts(ctx: RequestContext, input: TransferBetweenAccountsInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify both accounts exist and belong to tenant
    const [fromAccount] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.fromAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!fromAccount) throw new NotFoundError('Source billing account', input.fromAccountId);

    const [toAccount] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.toAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!toAccount) throw new NotFoundError('Destination billing account', input.toAccountId);

    // Verify both accounts belong to the same primary customer
    if (fromAccount.primaryCustomerId !== toAccount.primaryCustomerId) {
      throw new ValidationError('Transfer is only allowed between accounts of the same customer');
    }

    if (input.fromAccountId === input.toAccountId) {
      throw new ValidationError('Cannot transfer to the same account');
    }

    // Create debit AR transaction on source account
    const [debitTx] = await (tx as any).insert(arTransactions).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.fromAccountId,
      type: 'adjustment',
      amountCents: -input.amountCents,
      referenceType: 'account_transfer',
      referenceId: input.toAccountId,
      customerId: fromAccount.primaryCustomerId,
      notes: `Transfer to ${toAccount.name}: ${input.reason}`,
      createdBy: ctx.user.id,
    }).returning();

    // Create credit AR transaction on destination account
    const [creditTx] = await (tx as any).insert(arTransactions).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.toAccountId,
      type: 'adjustment',
      amountCents: input.amountCents,
      referenceType: 'account_transfer',
      referenceId: input.fromAccountId,
      customerId: toAccount.primaryCustomerId,
      notes: `Transfer from ${fromAccount.name}: ${input.reason}`,
      createdBy: ctx.user.id,
    }).returning();

    // Update both account balances atomically
    const newFromBalance = Number(fromAccount.currentBalanceCents) - input.amountCents;
    await (tx as any).update(billingAccounts).set({
      currentBalanceCents: newFromBalance,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.fromAccountId));

    const newToBalance = Number(toAccount.currentBalanceCents) + input.amountCents;
    await (tx as any).update(billingAccounts).set({
      currentBalanceCents: newToBalance,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.toAccountId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: fromAccount.primaryCustomerId,
      activityType: 'system',
      title: `Balance transfer: ${input.amountCents} cents from ${fromAccount.name} to ${toAccount.name}`,
      metadata: {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amountCents: input.amountCents,
        reason: input.reason,
        debitTransactionId: debitTx!.id,
        creditTransactionId: creditTx!.id,
        newFromBalance,
        newToBalance,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.account_transfer.completed.v1', {
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      customerId: fromAccount.primaryCustomerId,
      amountCents: input.amountCents,
      reason: input.reason,
      debitTransactionId: debitTx!.id,
      creditTransactionId: creditTx!.id,
      newFromBalance,
      newToBalance,
    });

    return {
      result: {
        debitTransactionId: debitTx!.id,
        creditTransactionId: creditTx!.id,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amountCents: input.amountCents,
        newFromBalance,
        newToBalance,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'customer.account_transfer', 'billing_account', input.fromAccountId);
  return result;
}
