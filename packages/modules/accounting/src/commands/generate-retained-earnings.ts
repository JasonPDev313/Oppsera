import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glJournalEntries, glJournalLines, glAccounts } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';
import { generateJournalNumber } from '../helpers/generate-journal-number';
import type { GenerateRetainedEarningsInput } from '../validation';

export async function generateRetainedEarnings(
  ctx: RequestContext,
  input: GenerateRetainedEarningsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const endDate = input.fiscalYearEnd;
    const endYear = parseInt(endDate.substring(0, 4));

    // 1. Get fiscal year start month from settings
    const settingsRows = await tx.execute(sql`
      SELECT fiscal_year_start_month, default_rounding_account_id
      FROM accounting_settings
      WHERE tenant_id = ${ctx.tenantId} LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const fyStartMonth = settingsArr.length > 0 ? Number(settingsArr[0]!.fiscal_year_start_month) : 1;

    // Determine fiscal year start date
    // If FY starts in month M and our end date is in that year:
    //   If end month >= start month: FY start = YYYY-MM-01
    //   If end month < start month: FY start = (YYYY-1)-MM-01
    const endMonth = parseInt(endDate.substring(5, 7));
    const startYear = endMonth >= fyStartMonth ? endYear : endYear - 1;
    const startDate = `${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`;

    // 2. Idempotency: check if entry already exists for this FY close
    const sourceRef = `retained-earnings-${startDate}-${endDate}`;
    const existingRows = await tx.execute(sql`
      SELECT id FROM gl_journal_entries
      WHERE tenant_id = ${ctx.tenantId}
        AND source_module = 'accounting'
        AND source_reference_id = ${sourceRef}
      LIMIT 1
    `);
    const existingArr = Array.from(existingRows as Iterable<Record<string, unknown>>);
    if (existingArr.length > 0) {
      throw new AppError('DUPLICATE_CLOSE', `Retained earnings entry already exists for FY ${startDate} to ${endDate}`, 409);
    }

    // 3. Compute net income: Revenue - Expenses
    const incomeRows = await tx.execute(sql`
      SELECT
        COALESCE(
          SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit_amount - jl.debit_amount ELSE 0 END), 0
        ) AS total_revenue,
        COALESCE(
          SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit_amount - jl.credit_amount ELSE 0 END), 0
        ) AS total_expenses
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      JOIN gl_accounts a ON a.id = jl.account_id
      WHERE je.tenant_id = ${ctx.tenantId}
        AND je.status = 'posted'
        AND je.business_date >= ${startDate}
        AND je.business_date <= ${endDate}
        AND a.account_type IN ('revenue', 'expense')
    `);
    const incArr = Array.from(incomeRows as Iterable<Record<string, unknown>>);
    const totalRevenue = incArr.length > 0 ? Number(incArr[0]!.total_revenue) : 0;
    const totalExpenses = incArr.length > 0 ? Number(incArr[0]!.total_expenses) : 0;
    const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

    if (Math.abs(netIncome) < 0.01) {
      throw new AppError('NO_NET_INCOME', 'Net income is zero — no retained earnings entry needed', 400);
    }

    // 4. Validate retained earnings account
    const [reAccount] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(sql`${glAccounts.id} = ${input.retainedEarningsAccountId} AND ${glAccounts.tenantId} = ${ctx.tenantId}`)
      .limit(1);

    if (!reAccount) {
      throw new AppError('INVALID_ACCOUNT', 'Retained earnings account not found', 400);
    }

    // 5. Create closing journal entry
    // Close each revenue and expense account to Retained Earnings:
    //   DEBIT revenue accounts (closing their credit balances)
    //   CREDIT expense accounts (closing their debit balances)
    //   Net difference → Retained Earnings
    const entryId = generateUlid();
    const journalNumber = await generateJournalNumber(tx, ctx.tenantId);
    const postingPeriod = endDate.substring(0, 7); // YYYY-MM
    const now = new Date();
    const memo = input.memo ?? `Year-end close: FY ${startDate} to ${endDate}`;

    await tx.insert(glJournalEntries).values({
      id: entryId,
      tenantId: ctx.tenantId,
      journalNumber,
      sourceModule: 'accounting',
      sourceReferenceId: sourceRef,
      businessDate: endDate,
      postingPeriod,
      currency: 'USD',
      status: 'posted',
      memo,
      postedAt: now,
      createdBy: ctx.user.id,
    });

    // 6. Get all revenue/expense accounts with balances in the fiscal year
    const acctRows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_type,
        COALESCE(SUM(jl.debit_amount), 0) AS total_debits,
        COALESCE(SUM(jl.credit_amount), 0) AS total_credits
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      JOIN gl_accounts a ON a.id = jl.account_id
      WHERE je.tenant_id = ${ctx.tenantId}
        AND je.status = 'posted'
        AND je.business_date >= ${startDate}
        AND je.business_date <= ${endDate}
        AND a.account_type IN ('revenue', 'expense')
      GROUP BY a.id, a.account_type
      HAVING COALESCE(SUM(jl.debit_amount), 0) != COALESCE(SUM(jl.credit_amount), 0)
    `);
    const acctArr = Array.from(acctRows as Iterable<Record<string, unknown>>);

    const lines: Array<{
      id: string;
      journalEntryId: string;
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      memo: string;
      sortOrder: number;
    }> = [];

    let totalClosingDebits = 0;
    let totalClosingCredits = 0;
    let sortOrder = 0;

    for (const acct of acctArr) {
      const accountId = String(acct.account_id);
      const accountType = String(acct.account_type);
      const debits = Number(acct.total_debits);
      const credits = Number(acct.total_credits);

      if (accountType === 'revenue') {
        // Revenue normally has credit balance (credits > debits). Close by debiting.
        const balance = credits - debits;
        if (Math.abs(balance) >= 0.01) {
          if (balance > 0) {
            lines.push({
              id: generateUlid(),
              journalEntryId: entryId,
              accountId,
              debitAmount: balance.toFixed(2),
              creditAmount: '0',
              memo: 'Close revenue to retained earnings',
              sortOrder: sortOrder++,
            });
            totalClosingDebits += balance;
          } else {
            lines.push({
              id: generateUlid(),
              journalEntryId: entryId,
              accountId,
              debitAmount: '0',
              creditAmount: Math.abs(balance).toFixed(2),
              memo: 'Close revenue to retained earnings',
              sortOrder: sortOrder++,
            });
            totalClosingCredits += Math.abs(balance);
          }
        }
      } else {
        // Expense normally has debit balance (debits > credits). Close by crediting.
        const balance = debits - credits;
        if (Math.abs(balance) >= 0.01) {
          if (balance > 0) {
            lines.push({
              id: generateUlid(),
              journalEntryId: entryId,
              accountId,
              debitAmount: '0',
              creditAmount: balance.toFixed(2),
              memo: 'Close expense to retained earnings',
              sortOrder: sortOrder++,
            });
            totalClosingCredits += balance;
          } else {
            lines.push({
              id: generateUlid(),
              journalEntryId: entryId,
              accountId,
              debitAmount: Math.abs(balance).toFixed(2),
              creditAmount: '0',
              memo: 'Close expense to retained earnings',
              sortOrder: sortOrder++,
            });
            totalClosingDebits += Math.abs(balance);
          }
        }
      }
    }

    // 7. Add the retained earnings line to balance the entry
    // Total debits from closing revenue, total credits from closing expenses.
    // Net difference goes to RE.
    const reDiff = Math.round((totalClosingDebits - totalClosingCredits) * 100) / 100;
    if (reDiff > 0) {
      // More debits than credits from closing → credit RE (profit)
      lines.push({
        id: generateUlid(),
        journalEntryId: entryId,
        accountId: input.retainedEarningsAccountId,
        debitAmount: '0',
        creditAmount: reDiff.toFixed(2),
        memo: 'Net income to retained earnings',
        sortOrder: sortOrder++,
      });
    } else if (reDiff < 0) {
      // More credits than debits → debit RE (loss)
      lines.push({
        id: generateUlid(),
        journalEntryId: entryId,
        accountId: input.retainedEarningsAccountId,
        debitAmount: Math.abs(reDiff).toFixed(2),
        creditAmount: '0',
        memo: 'Net loss to retained earnings',
        sortOrder: sortOrder++,
      });
    }

    if (lines.length > 0) {
      await tx.insert(glJournalLines).values(lines);
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.JOURNAL_POSTED, {
      journalEntryId: entryId,
      journalNumber,
      sourceModule: 'accounting',
    });

    return {
      result: {
        id: entryId,
        journalNumber,
        netIncome,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        fiscalYearStart: startDate,
        fiscalYearEnd: endDate,
        lineCount: lines.length,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.retained_earnings.generated', 'gl_journal_entry', result.id);
  return result;
}
