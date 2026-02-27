import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, arTransactions, customerActivityLog } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
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

  // ── GL posting (after AR transaction committed) ──────────────
  try {
    const postingApi = getAccountingPostingApi();
    try { await postingApi.ensureSettings(ctx.tenantId); } catch { /* non-fatal */ }
    const settings = await postingApi.getSettings(ctx.tenantId);

    const arAccountId = settings.defaultARControlAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    const glLines = buildModernGlLines(
      input.type, input.amountCents,
      arAccountId, revenueAccountId, cashAccountId,
      ctx.locationId ?? undefined,
    );

    if (glLines.length > 0) {
      const businessDate = new Date().toISOString().split('T')[0]!;
      const glResult = await postingApi.postEntry(ctx, {
        businessDate,
        sourceModule: 'billing',
        sourceReferenceId: `ar-tx-${result.id}`,
        memo: `AR ${input.type}: ${Math.abs(input.amountCents)} cents`,
        lines: glLines,
        forcePost: true,
      });

      // Best-effort: link GL journal entry to AR transaction
      try {
        await withTenant(ctx.tenantId, async (tx) => {
          await tx
            .update(arTransactions)
            .set({ glJournalEntryId: glResult.id })
            .where(eq(arTransactions.id, result.id));
        });
      } catch { /* non-fatal */ }
    }
  } catch (error) {
    // GL failures NEVER block AR operations
    console.error(`[ar-gl] GL posting failed for AR transaction ${result.id}:`, error);
  }

  await auditLog(ctx, `ar.${input.type}.created`, 'ar_transaction', result.id);
  return result;
}

/**
 * Build GL journal lines using resolved account IDs (not hardcoded codes).
 * Returns empty array if required accounts are missing.
 */
function buildModernGlLines(
  type: string,
  amountCents: number,
  arAccountId: string | null,
  revenueAccountId: string | null,
  cashAccountId: string | null,
  locationId?: string,
): Array<{ accountId: string; debitAmount: string; creditAmount: string; locationId?: string; memo?: string }> {
  const absAmount = Math.abs(amountCents);
  const amountDollars = (absAmount / 100).toFixed(2);

  switch (type) {
    case 'charge':
      if (!arAccountId || !revenueAccountId) return [];
      return [
        { accountId: arAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'AR charge' },
        { accountId: revenueAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'Revenue' },
      ];
    case 'payment':
      if (!cashAccountId || !arAccountId) return [];
      return [
        { accountId: cashAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'Cash received' },
        { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'AR payment' },
      ];
    case 'adjustment':
      if (!arAccountId || !revenueAccountId) return [];
      if (amountCents < 0) {
        return [
          { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'AR adjustment (credit)' },
          { accountId: revenueAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'Revenue adjustment' },
        ];
      }
      return [
        { accountId: arAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'AR adjustment (debit)' },
        { accountId: revenueAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'Revenue adjustment' },
      ];
    case 'writeoff':
      // Writeoffs: Dr Bad Debt Expense / Cr AR — falls back to revenue for bad debt
      if (!arAccountId || !revenueAccountId) return [];
      return [
        { accountId: revenueAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'Bad debt expense' },
        { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'AR writeoff' },
      ];
    case 'late_fee':
      // Late fees: Dr AR / Cr Revenue
      if (!arAccountId || !revenueAccountId) return [];
      return [
        { accountId: arAccountId, debitAmount: amountDollars, creditAmount: '0', locationId, memo: 'AR late fee' },
        { accountId: revenueAccountId, debitAmount: '0', creditAmount: amountDollars, locationId, memo: 'Late fee revenue' },
      ];
    default:
      return [];
  }
}
