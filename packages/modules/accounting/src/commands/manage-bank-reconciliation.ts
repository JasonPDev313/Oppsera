import { eq, and, sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { generateUlid } from '@oppsera/shared';
import { bankAccounts, bankReconciliations, bankReconciliationItems } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import type {
  StartBankReconciliationInput,
  ClearReconciliationItemsInput,
  AddBankAdjustmentInput,
  CompleteBankReconciliationInput,
} from '../validation';

// ── Types ────────────────────────────────────────────────────

export interface BankReconciliation {
  id: string;
  tenantId: string;
  bankAccountId: string;
  bankAccountName: string | null;
  glAccountId: string | null;
  statementDate: string;
  statementEndingBalance: string;
  beginningBalance: string;
  status: string;
  clearedBalance: string;
  outstandingDeposits: string;
  outstandingWithdrawals: string;
  adjustmentTotal: string;
  difference: string;
  reconciledBy: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankReconciliationItem {
  id: string;
  reconciliationId: string;
  glJournalLineId: string | null;
  itemType: string;
  amount: string;
  date: string;
  description: string | null;
  isCleared: boolean;
  clearedDate: string | null;
  glJournalEntryId: string | null;
  journalNumber: number | null;
  journalMemo: string | null;
  sourceModule: string | null;
  createdAt: string;
}

// ── Start Reconciliation ─────────────────────────────────────

export async function startBankReconciliation(
  ctx: RequestContext,
  input: StartBankReconciliationInput,
): Promise<BankReconciliation> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate bank account exists
    const [bankAccount] = await tx
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, input.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
      .limit(1);

    if (!bankAccount) throw new Error('Bank account not found');

    // Check for existing in-progress reconciliation
    const [existing] = await tx
      .select({ id: bankReconciliations.id })
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.tenantId, ctx.tenantId),
          eq(bankReconciliations.bankAccountId, input.bankAccountId),
          eq(bankReconciliations.status, 'in_progress'),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error('An in-progress reconciliation already exists for this bank account. Complete or delete it first.');
    }

    // Get beginning balance from last completed reconciliation
    const lastRecRows = await tx.execute(sql`
      SELECT statement_ending_balance
      FROM bank_reconciliations
      WHERE tenant_id = ${ctx.tenantId}
        AND bank_account_id = ${input.bankAccountId}
        AND status = 'completed'
      ORDER BY statement_date DESC
      LIMIT 1
    `);
    const lastRecArr = Array.from(lastRecRows as Iterable<Record<string, unknown>>);
    const beginningBalance = lastRecArr.length > 0
      ? String(lastRecArr[0]!.statement_ending_balance)
      : '0';

    // Create reconciliation
    const id = generateUlid();
    const now = new Date();

    const [created] = await tx
      .insert(bankReconciliations)
      .values({
        id,
        tenantId: ctx.tenantId,
        bankAccountId: input.bankAccountId,
        statementDate: input.statementDate,
        statementEndingBalance: input.statementEndingBalance,
        beginningBalance,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Auto-populate unreconciled GL lines hitting this bank's GL account
    const glLines = await tx.execute(sql`
      SELECT
        jl.id AS line_id,
        jl.debit_amount,
        jl.credit_amount,
        jl.memo,
        je.business_date,
        je.source_module,
        je.journal_number
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${ctx.tenantId}
        AND jl.account_id = ${bankAccount.glAccountId}
        AND je.status = 'posted'
        AND je.business_date <= ${input.statementDate}
        AND jl.id NOT IN (
          SELECT bri.gl_journal_line_id
          FROM bank_reconciliation_items bri
          JOIN bank_reconciliations br ON br.id = bri.reconciliation_id
          WHERE br.tenant_id = ${ctx.tenantId}
            AND br.bank_account_id = ${input.bankAccountId}
            AND br.status = 'completed'
            AND bri.is_cleared = true
            AND bri.gl_journal_line_id IS NOT NULL
        )
      ORDER BY je.business_date ASC
    `);

    const glArr = Array.from(glLines as Iterable<Record<string, unknown>>);

    for (const line of glArr) {
      const debit = Number(line.debit_amount ?? 0);
      const credit = Number(line.credit_amount ?? 0);
      const net = debit - credit; // positive = deposit, negative = withdrawal
      const itemType = net >= 0 ? 'deposit' : 'withdrawal';

      await tx.insert(bankReconciliationItems).values({
        id: generateUlid(),
        reconciliationId: id,
        tenantId: ctx.tenantId,
        glJournalLineId: String(line.line_id),
        itemType,
        amount: net.toFixed(2),
        date: String(line.business_date),
        description: line.memo ? String(line.memo) : `Journal #${line.journal_number} (${line.source_module})`,
        isCleared: false,
        createdAt: now,
      });
    }

    return {
      result: {
        id: created!.id,
        tenantId: created!.tenantId,
        bankAccountId: created!.bankAccountId,
        bankAccountName: bankAccount.name,
        glAccountId: bankAccount.glAccountId,
        statementDate: created!.statementDate,
        statementEndingBalance: created!.statementEndingBalance,
        beginningBalance: created!.beginningBalance,
        status: created!.status,
        clearedBalance: created!.clearedBalance,
        outstandingDeposits: created!.outstandingDeposits,
        outstandingWithdrawals: created!.outstandingWithdrawals,
        adjustmentTotal: created!.adjustmentTotal,
        difference: created!.difference,
        reconciledBy: created!.reconciledBy ?? null,
        completedAt: created!.completedAt?.toISOString() ?? null,
        notes: created!.notes ?? null,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      } satisfies BankReconciliation,
      events: [],
    };
  });

  auditLogDeferred(ctx, 'accounting.bank_reconciliation.started', 'bank_reconciliation', result.id);
  return result;
}

// ── Clear / Unclear Items ────────────────────────────────────

export async function clearReconciliationItems(
  ctx: RequestContext,
  input: ClearReconciliationItemsInput,
): Promise<void> {
  await publishWithOutbox(ctx, async (tx) => {
    // Validate reconciliation exists and is in-progress
    const [recon] = await tx
      .select()
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.id, input.reconciliationId),
          eq(bankReconciliations.tenantId, ctx.tenantId),
          eq(bankReconciliations.status, 'in_progress'),
        ),
      )
      .limit(1);

    if (!recon) throw new Error('Reconciliation not found or already completed');

    const clearedDate = input.cleared ? new Date().toISOString().split('T')[0]! : null;

    // Update items
    for (const itemId of input.itemIds) {
      await tx
        .update(bankReconciliationItems)
        .set({
          isCleared: input.cleared,
          clearedDate,
        })
        .where(
          and(
            eq(bankReconciliationItems.id, itemId),
            eq(bankReconciliationItems.reconciliationId, input.reconciliationId),
            eq(bankReconciliationItems.tenantId, ctx.tenantId),
          ),
        );
    }

    // Recompute balances
    await recomputeReconciliationBalances(tx, input.reconciliationId, ctx.tenantId);

    return { result: undefined, events: [] };
  });
}

// ── Add Bank Adjustment ──────────────────────────────────────

export async function addBankAdjustment(
  ctx: RequestContext,
  input: AddBankAdjustmentInput,
): Promise<BankReconciliationItem> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate reconciliation
    const [recon] = await tx
      .select()
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.id, input.reconciliationId),
          eq(bankReconciliations.tenantId, ctx.tenantId),
          eq(bankReconciliations.status, 'in_progress'),
        ),
      )
      .limit(1);

    if (!recon) throw new Error('Reconciliation not found or already completed');

    const id = generateUlid();
    const now = new Date();

    const [created] = await tx
      .insert(bankReconciliationItems)
      .values({
        id,
        reconciliationId: input.reconciliationId,
        tenantId: ctx.tenantId,
        glJournalLineId: null,
        itemType: input.itemType,
        amount: input.amount,
        date: input.date,
        description: input.description,
        isCleared: true, // bank-only items are always "cleared" (they're on the statement)
        clearedDate: input.date,
        createdAt: now,
      })
      .returning();

    // Recompute balances
    await recomputeReconciliationBalances(tx, input.reconciliationId, ctx.tenantId);

    return {
      result: {
        id: created!.id,
        reconciliationId: created!.reconciliationId,
        glJournalLineId: null,
        itemType: created!.itemType,
        amount: created!.amount,
        date: created!.date,
        description: created!.description ?? null,
        isCleared: created!.isCleared,
        clearedDate: created!.clearedDate ?? null,
        glJournalEntryId: null,
        journalNumber: null,
        journalMemo: null,
        sourceModule: null,
        createdAt: created!.createdAt.toISOString(),
      } satisfies BankReconciliationItem,
      events: [],
    };
  });

  return result;
}

// ── Complete Reconciliation ──────────────────────────────────

export async function completeBankReconciliation(
  ctx: RequestContext,
  input: CompleteBankReconciliationInput,
): Promise<BankReconciliation> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [recon] = await tx
      .select()
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.id, input.reconciliationId),
          eq(bankReconciliations.tenantId, ctx.tenantId),
          eq(bankReconciliations.status, 'in_progress'),
        ),
      )
      .limit(1);

    if (!recon) throw new Error('Reconciliation not found or already completed');

    // Verify difference is zero
    const diff = Number(recon.difference);
    if (Math.abs(diff) >= 0.01) {
      throw new Error(`Cannot complete: difference is ${Number(recon.difference).toFixed(2)}. Must be $0.00.`);
    }

    const now = new Date();

    // Post adjusting journal entries for bank-only items (fees, interest, adjustments)
    const bankOnlyItems = await tx
      .select()
      .from(bankReconciliationItems)
      .where(
        and(
          eq(bankReconciliationItems.reconciliationId, input.reconciliationId),
          eq(bankReconciliationItems.tenantId, ctx.tenantId),
          sql`${bankReconciliationItems.glJournalLineId} IS NULL`,
        ),
      );

    // Look up bank account for GL account
    const [bankAccount] = await tx
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, recon.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)))
      .limit(1);

    // Validate bank-only items have GL offset accounts available before completing.
    // Bank-only items (fees, interest) must be journalized — completing without
    // proper GL entries leaves the general ledger incomplete.
    const settings = bankAccount ? await getAccountingSettings(tx, ctx.tenantId) : null;
    const postingApi = getAccountingPostingApi();

    if (bankAccount && settings) {
      for (const item of bankOnlyItems) {
        const amount = Number(item.amount);
        if (amount === 0) continue;

        // Resolve the offset account based on item type
        let offsetAccountId: string | null = null;
        let memo = '';
        if (item.itemType === 'interest') {
          // Interest income: Dr Bank, Cr Interest Income
          offsetAccountId = settings.defaultInterestIncomeAccountId
            ?? settings.defaultUncategorizedRevenueAccountId
            ?? null;
          memo = `Bank interest income — reconciliation`;
        } else {
          // Fee/adjustment: Dr Expense, Cr Bank
          offsetAccountId = settings.defaultCcProcessingFeeAccountId
            ?? settings.defaultInterestExpenseAccountId
            ?? settings.defaultRoundingAccountId
            ?? null;
          memo = `Bank fee/adjustment — reconciliation`;
        }

        if (!offsetAccountId) {
          throw new Error(
            `Cannot complete: bank-only ${item.itemType} item ($${Math.abs(amount).toFixed(2)}) has no GL offset account configured. ` +
            `Set up interest income or processing fee accounts in Accounting Settings before completing.`,
          );
        }

        // Post the adjusting journal entry
        const absAmount = Math.abs(amount).toFixed(2);
        const glLines = item.itemType === 'interest'
          ? [
              { accountId: bankAccount.glAccountId, debitAmount: absAmount, creditAmount: '0', memo },
              { accountId: offsetAccountId, debitAmount: '0', creditAmount: absAmount, memo },
            ]
          : [
              { accountId: offsetAccountId, debitAmount: absAmount, creditAmount: '0', memo },
              { accountId: bankAccount.glAccountId, debitAmount: '0', creditAmount: absAmount, memo },
            ];

        await postingApi.postEntry(ctx, {
          businessDate: item.date ?? recon.statementDate,
          sourceModule: 'bank_reconciliation',
          sourceReferenceId: `recon-${input.reconciliationId}-item-${item.id}`,
          memo: `${memo} (${item.description ?? item.itemType})`,
          lines: glLines,
          forcePost: true,
        });
      }
    } else if (bankOnlyItems.filter((i) => Number(i.amount) !== 0).length > 0) {
      throw new Error('Cannot complete: bank-only items exist but bank account or accounting settings are missing.');
    }

    // Complete the reconciliation
    const [completed] = await tx
      .update(bankReconciliations)
      .set({
        status: 'completed',
        reconciledBy: ctx.user.id,
        completedAt: now,
        notes: input.notes ?? recon.notes,
        updatedAt: now,
      })
      .where(and(eq(bankReconciliations.id, input.reconciliationId), eq(bankReconciliations.tenantId, ctx.tenantId)))
      .returning();

    // Update bank account last reconciled date
    await tx
      .update(bankAccounts)
      .set({
        lastReconciledDate: recon.statementDate,
        updatedAt: now,
      })
      .where(and(eq(bankAccounts.id, recon.bankAccountId), eq(bankAccounts.tenantId, ctx.tenantId)));

    return {
      result: {
        id: completed!.id,
        tenantId: completed!.tenantId,
        bankAccountId: completed!.bankAccountId,
        bankAccountName: bankAccount?.name ?? null,
        glAccountId: bankAccount?.glAccountId ?? null,
        statementDate: completed!.statementDate,
        statementEndingBalance: completed!.statementEndingBalance,
        beginningBalance: completed!.beginningBalance,
        status: completed!.status,
        clearedBalance: completed!.clearedBalance,
        outstandingDeposits: completed!.outstandingDeposits,
        outstandingWithdrawals: completed!.outstandingWithdrawals,
        adjustmentTotal: completed!.adjustmentTotal,
        difference: completed!.difference,
        reconciledBy: completed!.reconciledBy ?? null,
        completedAt: completed!.completedAt?.toISOString() ?? null,
        notes: completed!.notes ?? null,
        createdAt: completed!.createdAt.toISOString(),
        updatedAt: completed!.updatedAt.toISOString(),
      } satisfies BankReconciliation,
      events: [],
    };
  });

  auditLogDeferred(ctx, 'accounting.bank_reconciliation.completed', 'bank_reconciliation', result.id);
  return result;
}

// ── Recompute Balances Helper ────────────────────────────────

async function recomputeReconciliationBalances(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  reconciliationId: string,
  tenantId: string,
): Promise<void> {
  // Get the reconciliation
  const [recon] = await tx
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, reconciliationId), eq(bankReconciliations.tenantId, tenantId)))
    .limit(1);

  if (!recon) return;

  // Compute cleared balance (sum of cleared items)
  const rows = await tx.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN is_cleared = true THEN amount::numeric ELSE 0 END), 0) AS cleared_total,
      COALESCE(SUM(CASE WHEN is_cleared = false AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) AS outstanding_deposits,
      COALESCE(SUM(CASE WHEN is_cleared = false AND amount::numeric < 0 THEN ABS(amount::numeric) ELSE 0 END), 0) AS outstanding_withdrawals,
      COALESCE(SUM(CASE WHEN gl_journal_line_id IS NULL THEN amount::numeric ELSE 0 END), 0) AS adjustment_total
    FROM bank_reconciliation_items
    WHERE reconciliation_id = ${reconciliationId}
      AND tenant_id = ${tenantId}
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  const clearedTotal = Number(arr[0]?.cleared_total ?? 0);
  const outstandingDeposits = Number(arr[0]?.outstanding_deposits ?? 0);
  const outstandingWithdrawals = Number(arr[0]?.outstanding_withdrawals ?? 0);
  const adjustmentTotal = Number(arr[0]?.adjustment_total ?? 0);

  // Adjusted book balance = beginning + cleared items
  const adjustedBookBalance = Number(recon.beginningBalance) + clearedTotal;
  const statementBalance = Number(recon.statementEndingBalance);
  const difference = adjustedBookBalance - statementBalance;

  await tx
    .update(bankReconciliations)
    .set({
      clearedBalance: clearedTotal.toFixed(2),
      outstandingDeposits: outstandingDeposits.toFixed(2),
      outstandingWithdrawals: outstandingWithdrawals.toFixed(2),
      adjustmentTotal: adjustmentTotal.toFixed(2),
      difference: difference.toFixed(2),
      updatedAt: new Date(),
    })
    .where(and(eq(bankReconciliations.id, reconciliationId), eq(bankReconciliations.tenantId, tenantId)));
}
