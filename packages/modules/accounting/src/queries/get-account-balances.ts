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
  /** Max accounts to return. Defaults to 200. */
  limit?: number;
  /** Cursor for pagination (account_number of last item). */
  cursor?: string;
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

    const cursorFilter = input.cursor
      ? sql`AND a.account_number > ${input.cursor}`
      : sql``;

    const limit = input.limit ?? 200;
    const queryLimit = limit + 1; // +1 for hasMore detection

    // NOTE: The LEFT JOIN chain filters je by status='posted' in the ON clause.
    // Without the (jl.id IS NULL OR je.id IS NOT NULL) guard, lines from non-posted
    // entries (draft/error/voided) would have NULL je.* but non-NULL jl.* values,
    // causing their amounts to be included in the SUM — corrupting balances.
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
        AND (jl.id IS NULL OR je.id IS NOT NULL)
        ${accountFilter}
        ${cursorFilter}
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance
      ORDER BY a.account_number
      LIMIT ${queryLimit}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      accountId: String(row.account_id),
      accountNumber: String(row.account_number),
      name: String(row.name),
      accountType: String(row.account_type),
      normalBalance: String(row.normal_balance),
      debitTotal: Number(row.debit_total),
      creditTotal: Number(row.credit_total),
      balance: Number(row.balance),
    }));

    // Trim to limit (the +1 row was only for hasMore detection)
    return allRows.length > limit ? allRows.slice(0, limit) : allRows;
  });
}
