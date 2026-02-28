import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ──────────────────────────────────────────────────────

export interface AgedTrialBalanceAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgedTrialBalanceTotals {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgedTrialBalanceReport {
  asOfDate: string;
  accounts: AgedTrialBalanceAccount[];
  totals: AgedTrialBalanceTotals;
  accountCount: number;
}

interface GetAgedTrialBalanceInput {
  tenantId: string;
  asOfDate: string;
  locationId?: string;
}

// ── Query ──────────────────────────────────────────────────────

export async function getAgedTrialBalance(
  input: GetAgedTrialBalanceInput,
): Promise<AgedTrialBalanceReport> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND jl.profit_center_id = ${input.locationId}`
      : sql``;

    // Aged trial balance: group journal lines by account, bucket by age of business_date
    // relative to the as-of date. Only posted entries, with GL guard.
    const rows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name AS account_name,
        a.account_type,
        a.normal_balance,
        COALESCE(SUM(
          CASE WHEN je.business_date >= ${input.asOfDate}::date
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
            ELSE 0 END
        ), 0) AS bucket_current,
        COALESCE(SUM(
          CASE WHEN je.business_date < ${input.asOfDate}::date
                AND je.business_date >= (${input.asOfDate}::date - INTERVAL '30 days')
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
            ELSE 0 END
        ), 0) AS bucket_1_30,
        COALESCE(SUM(
          CASE WHEN je.business_date < (${input.asOfDate}::date - INTERVAL '30 days')
                AND je.business_date >= (${input.asOfDate}::date - INTERVAL '60 days')
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
            ELSE 0 END
        ), 0) AS bucket_31_60,
        COALESCE(SUM(
          CASE WHEN je.business_date < (${input.asOfDate}::date - INTERVAL '60 days')
                AND je.business_date >= (${input.asOfDate}::date - INTERVAL '90 days')
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
            ELSE 0 END
        ), 0) AS bucket_61_90,
        COALESCE(SUM(
          CASE WHEN je.business_date < (${input.asOfDate}::date - INTERVAL '90 days')
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
            ELSE 0 END
        ), 0) AS bucket_90_plus
      FROM gl_accounts a
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        AND je.business_date <= ${input.asOfDate}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND (jl.id IS NULL OR je.id IS NOT NULL)
        ${locationFilter}
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance
      HAVING COALESCE(SUM(
        (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1)
      ), 0) != 0
      ORDER BY a.account_number
    `);

    const accounts: AgedTrialBalanceAccount[] = Array.from(
      rows as Iterable<Record<string, unknown>>,
    ).map((row) => {
      const isDebitNormal = String(row.normal_balance) === 'debit';
      const sign = isDebitNormal ? 1 : -1;

      return {
        accountId: String(row.account_id),
        accountNumber: String(row.account_number),
        accountName: String(row.account_name),
        accountType: String(row.account_type),
        normalBalance: String(row.normal_balance),
        current: Math.round(Number(row.bucket_current) * sign * 100) / 100,
        days1to30: Math.round(Number(row.bucket_1_30) * sign * 100) / 100,
        days31to60: Math.round(Number(row.bucket_31_60) * sign * 100) / 100,
        days61to90: Math.round(Number(row.bucket_61_90) * sign * 100) / 100,
        days90plus: Math.round(Number(row.bucket_90_plus) * sign * 100) / 100,
        total: Math.round(
          (Number(row.bucket_current) + Number(row.bucket_1_30) + Number(row.bucket_31_60) +
            Number(row.bucket_61_90) + Number(row.bucket_90_plus)) * sign * 100,
        ) / 100,
      };
    });

    const totals: AgedTrialBalanceTotals = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
      total: 0,
    };

    for (const acct of accounts) {
      totals.current += acct.current;
      totals.days1to30 += acct.days1to30;
      totals.days31to60 += acct.days31to60;
      totals.days61to90 += acct.days61to90;
      totals.days90plus += acct.days90plus;
      totals.total += acct.total;
    }

    totals.current = Math.round(totals.current * 100) / 100;
    totals.days1to30 = Math.round(totals.days1to30 * 100) / 100;
    totals.days31to60 = Math.round(totals.days31to60 * 100) / 100;
    totals.days61to90 = Math.round(totals.days61to90 * 100) / 100;
    totals.days90plus = Math.round(totals.days90plus * 100) / 100;
    totals.total = Math.round(totals.total * 100) / 100;

    return {
      asOfDate: input.asOfDate,
      accounts,
      totals,
      accountCount: accounts.length,
    };
  });
}
