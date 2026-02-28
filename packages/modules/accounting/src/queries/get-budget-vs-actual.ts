import { withTenant, sql } from '@oppsera/db';

export interface BudgetVsActualLine {
  glAccountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  budgetAmount: number;
  actualAmount: number;
  varianceDollar: number;
  variancePercent: number | null;
}

export interface BudgetVsActualSection {
  label: string;
  accounts: BudgetVsActualLine[];
  budgetSubtotal: number;
  actualSubtotal: number;
  varianceSubtotal: number;
}

export interface BudgetVsActualReport {
  budgetId: string;
  budgetName: string;
  fiscalYear: number;
  period: { from: string; to: string };
  sections: BudgetVsActualSection[];
  totalBudget: number;
  totalActual: number;
  totalVarianceDollar: number;
  totalVariancePercent: number | null;
}

/**
 * Compare budget amounts against GL actuals for a date range.
 * Sums the appropriate month columns from budget_lines based on the requested period,
 * and sums actual GL journal line amounts for the same period.
 */
export async function getBudgetVsActual(input: {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}): Promise<BudgetVsActualReport | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch budget header
    const budgetRows = await tx.execute(sql`
      SELECT id, name, fiscal_year FROM budgets
      WHERE id = ${input.budgetId} AND tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const budgetArr = Array.from(budgetRows as Iterable<Record<string, unknown>>);
    if (budgetArr.length === 0) return null;
    const budget = budgetArr[0]!;
    const fiscalYear = Number(budget.fiscal_year);

    // Determine which months are in the requested range
    // Month columns map to fiscal year months: month_1 = January of fiscal_year
    const fromDate = new Date(input.from);
    const toDate = new Date(input.to);
    const startMonth = fromDate.getFullYear() === fiscalYear ? fromDate.getMonth() + 1 : 1;
    const endMonth = toDate.getFullYear() === fiscalYear ? toDate.getMonth() + 1 : 12;

    // Build budget month sum expression
    const monthCols: string[] = [];
    for (let m = Math.max(1, startMonth); m <= Math.min(12, endMonth); m++) {
      monthCols.push(`month_${m}`);
    }
    const budgetSumExpr = monthCols.length > 0
      ? monthCols.join(' + ')
      : '0';

    // Fetch budget lines + GL actuals in one query
    const rows = await tx.execute(sql`
      SELECT
        bl.gl_account_id,
        ga.account_number,
        ga.name AS account_name,
        ga.account_type,
        ga.normal_balance,
        (${sql.raw(budgetSumExpr)}) AS budget_amount,
        COALESCE(act.actual_amount, 0) AS actual_amount
      FROM budget_lines bl
      JOIN gl_accounts ga ON ga.id = bl.gl_account_id
      LEFT JOIN (
        SELECT
          jl.account_id,
          SUM(
            CASE
              WHEN ga2.normal_balance = 'debit' THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
              ELSE COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
            END
          ) AS actual_amount
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts ga2 ON ga2.id = jl.account_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${input.from}
          AND je.business_date <= ${input.to}
          AND (jl.id IS NULL OR je.id IS NOT NULL)
        GROUP BY jl.account_id
      ) act ON act.account_id = bl.gl_account_id
      WHERE bl.budget_id = ${input.budgetId}
        AND bl.tenant_id = ${input.tenantId}
      ORDER BY ga.account_type, ga.account_number
    `);

    const allLines = Array.from(rows as Iterable<Record<string, unknown>>);

    // Group by account type into sections
    const sectionMap = new Map<string, BudgetVsActualLine[]>();
    const sectionOrder = ['revenue', 'expense', 'asset', 'liability', 'equity'];

    for (const r of allLines) {
      const accountType = String(r.account_type);
      const budgetAmt = Number(r.budget_amount ?? 0);
      const actualAmt = Number(r.actual_amount ?? 0);
      const variance = actualAmt - budgetAmt;
      const variancePct = budgetAmt !== 0 ? (variance / Math.abs(budgetAmt)) * 100 : null;

      const line: BudgetVsActualLine = {
        glAccountId: String(r.gl_account_id),
        accountNumber: String(r.account_number),
        accountName: String(r.account_name),
        accountType,
        normalBalance: String(r.normal_balance),
        budgetAmount: budgetAmt,
        actualAmount: actualAmt,
        varianceDollar: variance,
        variancePercent: variancePct !== null ? Math.round(variancePct * 100) / 100 : null,
      };

      if (!sectionMap.has(accountType)) {
        sectionMap.set(accountType, []);
      }
      sectionMap.get(accountType)!.push(line);
    }

    const sections: BudgetVsActualSection[] = [];
    let totalBudget = 0;
    let totalActual = 0;

    for (const type of sectionOrder) {
      const accounts = sectionMap.get(type);
      if (!accounts || accounts.length === 0) continue;

      const budgetSub = accounts.reduce((s, a) => s + a.budgetAmount, 0);
      const actualSub = accounts.reduce((s, a) => s + a.actualAmount, 0);

      sections.push({
        label: type.charAt(0).toUpperCase() + type.slice(1),
        accounts,
        budgetSubtotal: budgetSub,
        actualSubtotal: actualSub,
        varianceSubtotal: actualSub - budgetSub,
      });

      totalBudget += budgetSub;
      totalActual += actualSub;
    }

    const totalVar = totalActual - totalBudget;

    return {
      budgetId: String(budget.id),
      budgetName: String(budget.name),
      fiscalYear,
      period: { from: input.from, to: input.to },
      sections,
      totalBudget,
      totalActual,
      totalVarianceDollar: totalVar,
      totalVariancePercent: totalBudget !== 0 ? Math.round((totalVar / Math.abs(totalBudget)) * 10000) / 100 : null,
    };
  });
}
