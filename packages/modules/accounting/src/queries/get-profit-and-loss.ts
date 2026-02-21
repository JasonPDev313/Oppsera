import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface PnlAccountLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  classificationName: string | null;
  amount: number;
}

export interface PnlSection {
  label: string;
  accounts: PnlAccountLine[];
  subtotal: number;
}

export interface ProfitAndLoss {
  period: { from: string; to: string };
  locationId: string | null;
  sections: PnlSection[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  comparativePeriod?: { from: string; to: string };
  comparativeSections?: PnlSection[];
  comparativeNetIncome?: number;
}

interface GetPnlInput {
  tenantId: string;
  from: string; // YYYY-MM-DD
  to: string;
  locationId?: string;
  comparativeFrom?: string;
  comparativeTo?: string;
}

export async function getProfitAndLoss(input: GetPnlInput): Promise<ProfitAndLoss> {
  return withTenant(input.tenantId, async (tx) => {
    // Helper to compute P&L for a date range
    async function computePnl(from: string, to: string, locationId?: string) {
      const locationFilter = locationId
        ? sql`AND jl.location_id = ${locationId}`
        : sql``;

      const rows = await tx.execute(sql`
        SELECT
          a.id AS account_id,
          a.account_number,
          a.name AS account_name,
          a.account_type,
          COALESCE(c.name, a.account_type) AS classification_name,
          CASE WHEN a.account_type = 'revenue'
            THEN COALESCE(SUM(jl.credit_amount) - SUM(jl.debit_amount), 0)
            ELSE COALESCE(SUM(jl.debit_amount) - SUM(jl.credit_amount), 0)
          END AS amount
        FROM gl_accounts a
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
          ${locationFilter}
        LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.tenant_id = ${input.tenantId}
          AND je.business_date >= ${from}
          AND je.business_date <= ${to}
        WHERE a.tenant_id = ${input.tenantId}
          AND a.is_active = true
          AND a.account_type IN ('revenue', 'expense')
        GROUP BY a.id, a.account_number, a.name, a.account_type, c.name
        HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
            OR COALESCE(SUM(jl.credit_amount), 0) != 0
        ORDER BY a.account_number
      `);

      const accountRows = Array.from(rows as Iterable<Record<string, unknown>>);

      // Group by classification into sections
      const revenueSections = new Map<string, PnlAccountLine[]>();
      const expenseSections = new Map<string, PnlAccountLine[]>();
      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const row of accountRows) {
        const line: PnlAccountLine = {
          accountId: String(row.account_id),
          accountNumber: String(row.account_number),
          accountName: String(row.account_name),
          classificationName: row.classification_name ? String(row.classification_name) : null,
          amount: Number(row.amount),
        };

        const classLabel = line.classificationName ?? String(row.account_type);

        if (String(row.account_type) === 'revenue') {
          totalRevenue += line.amount;
          const arr = revenueSections.get(classLabel) ?? [];
          arr.push(line);
          revenueSections.set(classLabel, arr);
        } else {
          totalExpenses += line.amount;
          const arr = expenseSections.get(classLabel) ?? [];
          arr.push(line);
          expenseSections.set(classLabel, arr);
        }
      }

      totalRevenue = Math.round(totalRevenue * 100) / 100;
      totalExpenses = Math.round(totalExpenses * 100) / 100;

      const sections: PnlSection[] = [];

      // Revenue sections
      for (const [label, accounts] of revenueSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }

      // Expense sections
      for (const [label, accounts] of expenseSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }

      return { sections, totalRevenue, totalExpenses, netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100 };
    }

    const current = await computePnl(input.from, input.to, input.locationId);

    const result: ProfitAndLoss = {
      period: { from: input.from, to: input.to },
      locationId: input.locationId ?? null,
      sections: current.sections,
      totalRevenue: current.totalRevenue,
      totalExpenses: current.totalExpenses,
      netIncome: current.netIncome,
    };

    // Comparative period
    if (input.comparativeFrom && input.comparativeTo) {
      const comparative = await computePnl(input.comparativeFrom, input.comparativeTo, input.locationId);
      result.comparativePeriod = { from: input.comparativeFrom, to: input.comparativeTo };
      result.comparativeSections = comparative.sections;
      result.comparativeNetIncome = comparative.netIncome;
    }

    return result;
  });
}
