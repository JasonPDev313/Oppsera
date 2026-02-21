import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GlSummaryClassification {
  classificationId: string | null;
  classificationName: string | null;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
}

export interface GlSummaryReport {
  classifications: GlSummaryClassification[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  startDate: string | null;
  endDate: string | null;
}

interface GetGlSummaryInput {
  tenantId: string;
  startDate?: string;
  endDate?: string;
}

export async function getGlSummary(
  input: GetGlSummaryInput,
): Promise<GlSummaryReport> {
  return withTenant(input.tenantId, async (tx) => {
    const startDateFilter = input.startDate
      ? sql`AND je.business_date >= ${input.startDate}`
      : sql``;

    const endDateFilter = input.endDate
      ? sql`AND je.business_date <= ${input.endDate}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        a.classification_id,
        c.name AS classification_name,
        a.account_type,
        COALESCE(SUM(jl.debit_amount), 0) AS debit_total,
        COALESCE(SUM(jl.credit_amount), 0) AS credit_total,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
          ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
        END AS net_balance
      FROM gl_accounts a
      LEFT JOIN gl_classifications c ON c.id = a.classification_id
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        ${startDateFilter}
        ${endDateFilter}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
      GROUP BY a.classification_id, c.name, a.account_type, a.normal_balance
      HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
          OR COALESCE(SUM(jl.credit_amount), 0) != 0
      ORDER BY a.account_type, c.name
    `);

    const classifications = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      classificationId: row.classification_id ? String(row.classification_id) : null,
      classificationName: row.classification_name ? String(row.classification_name) : null,
      accountType: String(row.account_type),
      debitTotal: Number(row.debit_total),
      creditTotal: Number(row.credit_total),
      netBalance: Number(row.net_balance),
    }));

    // Aggregate by account type for P&L / Balance Sheet summary
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const c of classifications) {
      switch (c.accountType) {
        case 'revenue':
          totalRevenue += c.netBalance;
          break;
        case 'expense':
          totalExpenses += c.netBalance;
          break;
        case 'asset':
          totalAssets += c.netBalance;
          break;
        case 'liability':
          totalLiabilities += c.netBalance;
          break;
        case 'equity':
          totalEquity += c.netBalance;
          break;
      }
    }

    // Round to 2 decimal places
    totalRevenue = Math.round(totalRevenue * 100) / 100;
    totalExpenses = Math.round(totalExpenses * 100) / 100;
    totalAssets = Math.round(totalAssets * 100) / 100;
    totalLiabilities = Math.round(totalLiabilities * 100) / 100;
    totalEquity = Math.round(totalEquity * 100) / 100;

    const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

    return {
      classifications,
      totalRevenue,
      totalExpenses,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    };
  });
}
