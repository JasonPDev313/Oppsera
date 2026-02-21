import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface PeriodComparisonLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  currentAmount: number;
  priorAmount: number;
  varianceDollar: number;
  variancePercent: number | null; // null if prior = 0
}

export interface PeriodComparison {
  currentPeriod: { from: string; to: string };
  priorPeriod: { from: string; to: string };
  lines: PeriodComparisonLine[];
}

interface GetPeriodComparisonInput {
  tenantId: string;
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
}

export async function getPeriodComparison(input: GetPeriodComparisonInput): Promise<PeriodComparison> {
  return withTenant(input.tenantId, async (tx) => {
    // Get balances for both periods in one query
    const rows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name AS account_name,
        a.account_type,
        a.normal_balance,
        COALESCE(SUM(
          CASE WHEN je.business_date >= ${input.currentFrom} AND je.business_date <= ${input.currentTo}
            THEN CASE WHEN a.normal_balance = 'debit' THEN jl.debit_amount - jl.credit_amount ELSE jl.credit_amount - jl.debit_amount END
            ELSE 0 END
        ), 0) AS current_amount,
        COALESCE(SUM(
          CASE WHEN je.business_date >= ${input.priorFrom} AND je.business_date <= ${input.priorTo}
            THEN CASE WHEN a.normal_balance = 'debit' THEN jl.debit_amount - jl.credit_amount ELSE jl.credit_amount - jl.debit_amount END
            ELSE 0 END
        ), 0) AS prior_amount
      FROM gl_accounts a
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        AND (
          (je.business_date >= ${input.currentFrom} AND je.business_date <= ${input.currentTo})
          OR
          (je.business_date >= ${input.priorFrom} AND je.business_date <= ${input.priorTo})
        )
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND a.account_type IN ('revenue', 'expense')
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance
      HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
          OR COALESCE(SUM(jl.credit_amount), 0) != 0
      ORDER BY a.account_number
    `);

    const lines: PeriodComparisonLine[] = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => {
      const currentAmount = Math.round(Number(row.current_amount) * 100) / 100;
      const priorAmount = Math.round(Number(row.prior_amount) * 100) / 100;
      const varianceDollar = Math.round((currentAmount - priorAmount) * 100) / 100;
      const variancePercent = Math.abs(priorAmount) >= 0.01
        ? Math.round((varianceDollar / Math.abs(priorAmount)) * 10000) / 100
        : null;

      return {
        accountId: String(row.account_id),
        accountNumber: String(row.account_number),
        accountName: String(row.account_name),
        accountType: String(row.account_type),
        currentAmount,
        priorAmount,
        varianceDollar,
        variancePercent,
      };
    });

    return {
      currentPeriod: { from: input.currentFrom, to: input.currentTo },
      priorPeriod: { from: input.priorFrom, to: input.priorTo },
      lines,
    };
  });
}
