import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, arTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AdjustLedgerInput } from '../validation';

const LARGE_ADJUSTMENT_THRESHOLD_CENTS = 100_000; // $1,000

export async function adjustLedger(ctx: RequestContext, input: AdjustLedgerInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'adjustLedger');
      if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Verify billing account exists
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);

    // Validate adjustment amount based on type
    if (input.type === 'writeoff' && input.amountCents >= 0) {
      throw new ValidationError('Write-off amount must be negative (reduces balance)');
    }
    if (input.type === 'credit_memo' && input.amountCents >= 0) {
      throw new ValidationError('Credit memo amount must be negative (reduces balance)');
    }
    if (input.type === 'manual_charge' && input.amountCents <= 0) {
      throw new ValidationError('Manual charge amount must be positive');
    }

    // Create AR transaction
    const [arTx] = await (tx as any).insert(arTransactions).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.billingAccountId,
      type: input.type,
      amountCents: input.amountCents,
      referenceType: 'ledger_adjustment',
      referenceId: null,
      customerId: account.primaryCustomerId,
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    }).returning();

    // Update cached balance
    const newBalance = Number(account.currentBalanceCents) + input.amountCents;
    await (tx as any).update(billingAccounts).set({
      currentBalanceCents: newBalance,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.billingAccountId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'adjustment',
      title: `Ledger ${input.type}: ${input.amountCents > 0 ? '+' : ''}${input.amountCents} cents`,
      metadata: {
        arTransactionId: arTx!.id,
        type: input.type,
        amountCents: input.amountCents,
        reason: input.reason ?? null,
        approvedBy: input.approvedBy ?? null,
        newBalance,
      },
      createdBy: ctx.user.id,
    });

    // Record additional audit entry for large adjustments
    if (Math.abs(input.amountCents) >= LARGE_ADJUSTMENT_THRESHOLD_CENTS) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: account.primaryCustomerId,
        activityType: 'system',
        title: `Large adjustment flagged: ${input.type} of ${Math.abs(input.amountCents)} cents`,
        metadata: {
          arTransactionId: arTx!.id,
          type: input.type,
          amountCents: input.amountCents,
          reason: input.reason ?? null,
          approvedBy: input.approvedBy ?? null,
          flagged: true,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.ledger_entry.posted.v1', {
      transactionId: arTx!.id,
      billingAccountId: input.billingAccountId,
      customerId: account.primaryCustomerId,
      type: input.type,
      amountCents: input.amountCents,
      newBalance,
      reason: input.reason ?? null,
    });

    const resultData = { ...arTx!, newBalance };

    // Save idempotency key
    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'adjustLedger', resultData);
    }

    return { result: resultData, events: [event] };
  });

  await auditLog(ctx, `customer.ledger_${input.type}`, 'ar_transaction', result.id);
  return result;
}
