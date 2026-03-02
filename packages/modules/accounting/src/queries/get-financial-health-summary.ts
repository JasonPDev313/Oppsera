import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface FinancialHealthSummary {
  netIncomeCurrentMonth: number;
  netIncomeYTD: number;
  apBalance: number;
  arBalance: number;
  cashBalance: number;
  undepositedFunds: number;
  trialBalanceStatus: 'balanced' | 'unbalanced';
  unmappedEventsCount: number;
}

interface GetFinancialHealthInput {
  tenantId: string;
  asOfDate: string;
}

export async function getFinancialHealthSummary(input: GetFinancialHealthInput): Promise<FinancialHealthSummary> {
  return withTenant(input.tenantId, async (tx) => {
    // Step 1: Get settings (needed to compute date ranges + control account IDs)
    const settingsRows = await tx.execute(sql`
      SELECT
        fiscal_year_start_month,
        default_ap_control_account_id,
        default_ar_control_account_id,
        default_undeposited_funds_account_id
      FROM accounting_settings
      WHERE tenant_id = ${input.tenantId} LIMIT 1
    `);
    const setArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const settings = setArr.length > 0 ? setArr[0]! : ({} as Record<string, unknown>);
    const fyStartMonth = Number(settings.fiscal_year_start_month ?? 1);

    // Compute current month and YTD date ranges
    const asOfDate = input.asOfDate;
    const monthStart = asOfDate.substring(0, 7) + '-01';
    const asOfYear = parseInt(asOfDate.substring(0, 4));
    const asOfMonth = parseInt(asOfDate.substring(5, 7));
    const fyStartYear = asOfMonth >= fyStartMonth ? asOfYear : asOfYear - 1;
    const ytdStart = `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}-01`;

    // Collect control account IDs for a single batched balance query
    const controlAccountIds = [
      settings.default_ap_control_account_id,
      settings.default_ar_control_account_id,
      settings.default_undeposited_funds_account_id,
    ].filter(Boolean) as string[];

    // Step 2: Run all remaining queries in parallel
    const [incomeRows, controlBalanceRows, cashRows, trialRows, unmappedRows] = await Promise.all([
      // Net income (current month + YTD in one query)
      tx.execute(sql`
        SELECT
          COALESCE(SUM(
            CASE WHEN je.business_date >= ${monthStart} AND a.account_type = 'revenue' THEN jl.credit_amount - jl.debit_amount
                 WHEN je.business_date >= ${monthStart} AND a.account_type = 'expense' THEN -(jl.debit_amount - jl.credit_amount)
                 ELSE 0 END
          ), 0) AS month_net_income,
          COALESCE(SUM(
            CASE WHEN a.account_type = 'revenue' THEN jl.credit_amount - jl.debit_amount
                 WHEN a.account_type = 'expense' THEN -(jl.debit_amount - jl.credit_amount)
                 ELSE 0 END
          ), 0) AS ytd_net_income
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${ytdStart}
          AND je.business_date <= ${asOfDate}
          AND a.account_type IN ('revenue', 'expense')
      `),

      // Batched control account balances (AP, AR, undeposited — one query instead of 3)
      controlAccountIds.length > 0
        ? tx.execute(sql`
            SELECT
              jl.account_id,
              COALESCE(SUM(jl.credit_amount) - SUM(jl.debit_amount), 0) AS balance
            FROM gl_journal_lines jl
            JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
            WHERE jl.account_id IN ${sql`(${sql.join(controlAccountIds.map(id => sql`${id}`), sql`, `)})`}
              AND je.tenant_id = ${input.tenantId}
              AND je.status = 'posted'
              AND je.business_date <= ${asOfDate}
            GROUP BY jl.account_id
          `)
        : Promise.resolve([]),

      // Cash balance (all bank-tagged asset accounts)
      tx.execute(sql`
        SELECT
          COALESCE(SUM(jl.debit_amount) - SUM(jl.credit_amount), 0) AS balance
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date <= ${asOfDate}
          AND a.account_type = 'asset'
          AND a.control_account_type = 'bank'
      `),

      // Trial balance check
      tx.execute(sql`
        SELECT
          COALESCE(SUM(jl.debit_amount), 0) AS total_debits,
          COALESCE(SUM(jl.credit_amount), 0) AS total_credits
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
      `),

      // Unmapped events count
      tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_unmapped_events
        WHERE tenant_id = ${input.tenantId} AND resolved_at IS NULL
      `),
    ]);

    // Parse results
    const incArr = Array.from(incomeRows as Iterable<Record<string, unknown>>);

    const balanceMap = new Map<string, number>();
    for (const row of Array.from(controlBalanceRows as Iterable<Record<string, unknown>>)) {
      balanceMap.set(String(row.account_id), Number(row.balance));
    }
    const getBalance = (id: unknown) => (id ? balanceMap.get(String(id)) ?? 0 : 0);

    const cashArr = Array.from(cashRows as Iterable<Record<string, unknown>>);
    const cashBalance = cashArr.length > 0 ? Number(cashArr[0]!.balance) : 0;

    const trialArr = Array.from(trialRows as Iterable<Record<string, unknown>>);
    const totalDebits = trialArr.length > 0 ? Number(trialArr[0]!.total_debits) : 0;
    const totalCredits = trialArr.length > 0 ? Number(trialArr[0]!.total_credits) : 0;

    const unmappedArr = Array.from(unmappedRows as Iterable<Record<string, unknown>>);

    return {
      netIncomeCurrentMonth: Math.round(Number(incArr[0]?.month_net_income ?? 0) * 100) / 100,
      netIncomeYTD: Math.round(Number(incArr[0]?.ytd_net_income ?? 0) * 100) / 100,
      apBalance: Math.round(getBalance(settings.default_ap_control_account_id) * 100) / 100,
      arBalance: Math.round(getBalance(settings.default_ar_control_account_id) * 100) / 100,
      cashBalance: Math.round(cashBalance * 100) / 100,
      undepositedFunds: Math.round(getBalance(settings.default_undeposited_funds_account_id) * 100) / 100,
      trialBalanceStatus: Math.abs(totalDebits - totalCredits) < 0.01 ? 'balanced' : 'unbalanced',
      unmappedEventsCount: unmappedArr.length > 0 ? Number(unmappedArr[0]!.count) : 0,
    };
  });
}
