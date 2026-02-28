import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TrialBalanceAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  classificationName: string | null;
  normalBalance: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
}

export interface TrialBalanceReport {
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  asOfDate: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Count of non-posted GL entries (draft/error) — indicates potential data issues */
  nonPostedEntryCount: number;
}

interface GetTrialBalanceInput {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}

export async function getTrialBalance(
  input: GetTrialBalanceInput,
): Promise<TrialBalanceReport> {
  return withTenant(input.tenantId, async (tx) => {
    // asOfDate takes precedence — it's a point-in-time balance
    // startDate/endDate filter the date range for activity
    const dateConditions = input.asOfDate
      ? sql`AND je.business_date <= ${input.asOfDate}`
      : sql`
        ${input.startDate ? sql`AND je.business_date >= ${input.startDate}` : sql``}
        ${input.endDate ? sql`AND je.business_date <= ${input.endDate}` : sql``}
      `;

    // NOTE: The (jl.id IS NULL OR je.id IS NOT NULL) guard ensures lines from
    // non-posted entries (draft/error/voided) are excluded from balance calculations.
    const rows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name AS account_name,
        a.account_type,
        c.name AS classification_name,
        a.normal_balance,
        COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) AS debit_total,
        COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) AS credit_total,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) - COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
          ELSE COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) - COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
        END AS net_balance
      FROM gl_accounts a
      LEFT JOIN gl_classifications c ON c.id = a.classification_id
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        ${dateConditions}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND (jl.id IS NULL OR je.id IS NOT NULL)
      GROUP BY a.id, a.account_number, a.name, a.account_type, c.name, a.normal_balance
      HAVING COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
          OR COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
      ORDER BY a.account_number
    `);

    // Query for non-posted entries — surfaces data corruption to admin
    const nonPostedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM gl_journal_entries
      WHERE tenant_id = ${input.tenantId}
        AND status NOT IN ('posted', 'voided')
    `);
    const nonPostedArr = Array.from(nonPostedRows as Iterable<Record<string, unknown>>);
    const nonPostedEntryCount = nonPostedArr.length > 0 ? Number(nonPostedArr[0]!.cnt) : 0;

    const accounts = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      accountId: String(row.account_id),
      accountNumber: String(row.account_number),
      accountName: String(row.account_name),
      accountType: String(row.account_type),
      classificationName: row.classification_name ? String(row.classification_name) : null,
      normalBalance: String(row.normal_balance),
      debitTotal: Number(row.debit_total),
      creditTotal: Number(row.credit_total),
      netBalance: Number(row.net_balance),
    }));

    let totalDebits = 0;
    let totalCredits = 0;
    for (const account of accounts) {
      totalDebits += account.debitTotal;
      totalCredits += account.creditTotal;
    }

    // Round to 2 decimal places to avoid floating point comparison issues
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;

    return {
      accounts,
      totalDebits,
      totalCredits,
      isBalanced: totalDebits === totalCredits,
      asOfDate: input.asOfDate ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      nonPostedEntryCount,
    };
  });
}
