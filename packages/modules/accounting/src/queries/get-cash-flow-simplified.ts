import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CashFlowSimplified {
  period: { from: string; to: string };
  operating: {
    netIncome: number;
    changeInAP: number;
    changeInAR: number;
    netOperatingCashFlow: number;
  };
  investingStub: number; // placeholder
  financingStub: number; // placeholder
  netCashChange: number;
}

interface GetCashFlowInput {
  tenantId: string;
  from: string;
  to: string;
}

export async function getCashFlowSimplified(input: GetCashFlowInput): Promise<CashFlowSimplified> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Net income for period
    const incomeRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit_amount - jl.debit_amount ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit_amount - jl.credit_amount ELSE 0 END), 0) AS expenses
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      JOIN gl_accounts a ON a.id = jl.account_id
      WHERE je.tenant_id = ${input.tenantId}
        AND je.status = 'posted'
        AND je.business_date >= ${input.from}
        AND je.business_date <= ${input.to}
        AND a.account_type IN ('revenue', 'expense')
    `);
    const incArr = Array.from(incomeRows as Iterable<Record<string, unknown>>);
    const netIncome = Math.round(
      (Number(incArr[0]?.revenue ?? 0) - Number(incArr[0]?.expenses ?? 0)) * 100,
    ) / 100;

    // 2. Get AP/AR control accounts from settings
    const settingsRows = await tx.execute(sql`
      SELECT default_ap_control_account_id, default_ar_control_account_id
      FROM accounting_settings
      WHERE tenant_id = ${input.tenantId} LIMIT 1
    `);
    const setArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const apAccountId = setArr.length > 0 ? setArr[0]!.default_ap_control_account_id : null;
    const arAccountId = setArr.length > 0 ? setArr[0]!.default_ar_control_account_id : null;

    // Helper to get account balance change over a period
    async function getBalanceChange(accountId: string | null): Promise<number> {
      if (!accountId) return 0;
      const rows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(jl.credit_amount) - SUM(jl.debit_amount), 0) AS change
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = ${accountId}
          AND je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${input.from}
          AND je.business_date <= ${input.to}
      `);
      const arr = Array.from(rows as Iterable<Record<string, unknown>>);
      return arr.length > 0 ? Number(arr[0]!.change) : 0;
    }

    const changeInAP = Math.round((await getBalanceChange(apAccountId as string | null)) * 100) / 100;
    const changeInAR = Math.round((await getBalanceChange(arAccountId as string | null)) * 100) / 100;

    // Operating cash flow = Net Income + Change in AP - Change in AR
    const netOperatingCashFlow = Math.round((netIncome + changeInAP - changeInAR) * 100) / 100;

    return {
      period: { from: input.from, to: input.to },
      operating: {
        netIncome,
        changeInAP,
        changeInAR,
        netOperatingCashFlow,
      },
      investingStub: 0,
      financingStub: 0,
      netCashChange: netOperatingCashFlow,
    };
  });
}
