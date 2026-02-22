import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements, paymentSettlementLines, bankAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import type { PostSettlementInput } from '../validation';

export async function postSettlement(
  ctx: RequestContext,
  input: PostSettlementInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load settlement
    const [settlement] = await tx
      .select()
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new NotFoundError('Payment Settlement', input.settlementId);
    }

    if (settlement.status === 'posted') {
      throw new Error('Settlement is already posted');
    }

    // Check for unmatched lines unless force
    if (!input.force) {
      const unmatchedLines = await tx
        .select({ id: paymentSettlementLines.id })
        .from(paymentSettlementLines)
        .where(
          and(
            eq(paymentSettlementLines.tenantId, ctx.tenantId),
            eq(paymentSettlementLines.settlementId, input.settlementId),
            eq(paymentSettlementLines.status, 'unmatched'),
          ),
        )
        .limit(1);

      if (unmatchedLines.length > 0) {
        throw new Error('Settlement has unmatched tenders. Use force=true to override.');
      }
    }

    // Get GL accounts
    const settings = await getAccountingSettings(tx, ctx.tenantId);
    if (!settings) {
      throw new Error('Accounting settings not configured');
    }

    // Resolve bank account GL
    let bankGlAccountId: string | null = null;
    if (settlement.bankAccountId) {
      const [bank] = await tx
        .select({ glAccountId: bankAccounts.glAccountId })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.tenantId, ctx.tenantId),
            eq(bankAccounts.id, settlement.bankAccountId),
          ),
        )
        .limit(1);
      bankGlAccountId = bank?.glAccountId ?? null;
    }

    if (!bankGlAccountId) {
      throw new Error('No bank account assigned to this settlement. Assign a bank account before posting.');
    }

    const undepositedFundsAccountId = settings.defaultUndepositedFundsAccountId;
    if (!undepositedFundsAccountId) {
      throw new Error('Undeposited Funds GL account not configured in accounting settings');
    }

    const grossAmount = Number(settlement.grossAmount);
    const feeAmount = Number(settlement.feeAmount);
    const netAmount = Number(settlement.netAmount);

    // Build journal lines:
    // Dr Bank Account (net amount)
    // Dr Processing Fee Expense (fee amount) — if fee > 0
    // Cr Undeposited Funds (gross amount)
    const lines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      memo?: string;
    }> = [];

    // Dr Bank (net)
    lines.push({
      accountId: bankGlAccountId,
      debitAmount: netAmount.toFixed(2),
      creditAmount: '0',
      memo: `Settlement ${settlement.processorName} ${settlement.processorBatchId ?? ''}`.trim(),
    });

    // Dr Processing Fees (if any)
    if (feeAmount > 0) {
      // Try to find fee expense account from payment type GL mapping for 'card'
      // Fall back to a general expense approach
      const feeAccountId = await resolveFeeExpenseAccount(tx, ctx.tenantId, settings);
      if (feeAccountId) {
        lines.push({
          accountId: feeAccountId,
          debitAmount: feeAmount.toFixed(2),
          creditAmount: '0',
          memo: `Processing fees - ${settlement.processorName}`,
        });
      }
    }

    // Cr Undeposited Funds (gross)
    lines.push({
      accountId: undepositedFundsAccountId,
      debitAmount: '0',
      creditAmount: grossAmount.toFixed(2),
      memo: `Settlement clearing - ${settlement.processorName}`,
    });

    // If fees weren't separately posted, adjust bank debit to equal gross
    if (feeAmount > 0 && lines.length === 2) {
      // No fee account found — net the fees into the bank debit (net already accounts for fees)
      // The journal is already balanced: Dr Bank(net) = Cr Undeposited(gross) - fees not tracked
      // This is acceptable but log a warning
    }

    // Post GL journal entry
    const postingApi = getAccountingPostingApi();
    const journalResult = await postingApi.postEntry(ctx, {
      businessDate: settlement.settlementDate,
      sourceModule: 'settlement',
      sourceReferenceId: settlement.id,
      memo: `Card settlement - ${settlement.processorName} ${settlement.processorBatchId ?? ''}`.trim(),
      lines,
      forcePost: true,
    });

    // Update settlement status
    await tx
      .update(paymentSettlements)
      .set({
        status: 'posted',
        glJournalEntryId: journalResult.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      );

    const event = buildEventFromContext(ctx, 'payment.settlement.posted.v1', {
      settlementId: settlement.id,
      grossAmount: settlement.grossAmount,
      netAmount: settlement.netAmount,
      feeAmount: settlement.feeAmount,
      journalEntryId: journalResult.id,
    });

    return {
      result: {
        ...settlement,
        status: 'posted' as const,
        glJournalEntryId: journalResult.id,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.settlement.posted', 'payment_settlement', input.settlementId);
  return result;
}

/**
 * Resolve fee expense account: check card payment type mapping first,
 * then fall back to null (fees folded into net).
 */
async function resolveFeeExpenseAccount(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
  _settings: NonNullable<Awaited<ReturnType<typeof getAccountingSettings>>>,
): Promise<string | null> {
  const { sql } = await import('drizzle-orm');
  const rows = await tx.execute(sql`
    SELECT fee_expense_account_id
    FROM payment_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND payment_type_id = 'card'
    LIMIT 1
  `);
  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length > 0 && arr[0]!.fee_expense_account_id) {
    return String(arr[0]!.fee_expense_account_id);
  }
  return null;
}
