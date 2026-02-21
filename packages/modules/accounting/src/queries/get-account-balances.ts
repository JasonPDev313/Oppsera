import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface AccountBalance {
  accountId: string;
  accountNumber: string;
  name: string;
  accountType: string;
  normalBalance: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

interface GetAccountBalancesInput {
  tenantId: string;
  accountIds?: string[];
  asOfDate?: string;
}

export async function getAccountBalances(
  input: GetAccountBalancesInput,
): Promise<AccountBalance[]> {
  return withTenant(input.tenantId, async (tx) => {
    const accountFilter = input.accountIds && input.accountIds.length > 0
      ? sql`AND a.id = ANY(${input.accountIds})`
      : sql``;

    const dateFilter = input.asOfDate
      ? sql`AND je.business_date <= ${input.asOfDate}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name,
        a.account_type,
        a.normal_balance,
        COALESCE(SUM(jl.debit_amount), 0) AS debit_total,
        COALESCE(SUM(jl.credit_amount), 0) AS credit_total,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
          ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
        END AS balance
      FROM gl_accounts a
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        ${dateFilter}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        ${accountFilter}
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance
      ORDER BY a.account_number
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      accountId: String(row.account_id),
      accountNumber: String(row.account_number),
      name: String(row.name),
      accountType: String(row.account_type),
      normalBalance: String(row.normal_balance),
      debitTotal: Number(row.debit_total),
      creditTotal: Number(row.credit_total),
      balance: Number(row.balance),
    }));
  });
}
