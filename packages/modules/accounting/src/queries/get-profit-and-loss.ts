import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface PnlAccountLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  classificationName: string | null;
  isContraAccount: boolean;
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
  grossRevenue: number;
  contraRevenue: number;
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
  profitCenterId?: string;
  subDepartmentId?: string;
  channel?: string;
  comparativeFrom?: string;
  comparativeTo?: string;
}

export async function getProfitAndLoss(input: GetPnlInput): Promise<ProfitAndLoss> {
  return withTenant(input.tenantId, async (tx) => {
    // Helper to compute P&L for a date range
    async function computePnl(from: string, to: string, filters?: { locationId?: string; profitCenterId?: string; subDepartmentId?: string; channel?: string }) {
      const locationFilter = filters?.locationId
        ? sql`AND jl.location_id = ${filters.locationId}`
        : sql``;

      const profitCenterFilter = filters?.profitCenterId
        ? sql`AND jl.profit_center_id = ${filters.profitCenterId}`
        : sql``;

      const subDepartmentFilter = filters?.subDepartmentId
        ? sql`AND jl.sub_department_id = ${filters.subDepartmentId}`
        : sql``;

      const channelFilter = filters?.channel
        ? sql`AND jl.channel = ${filters.channel}`
        : sql``;

      const rows = await tx.execute(sql`
        SELECT
          a.id AS account_id,
          a.account_number,
          a.name AS account_name,
          a.account_type,
          a.is_contra_account,
          COALESCE(c.name, a.account_type) AS classification_name,
          CASE WHEN a.account_type = 'revenue'
            THEN COALESCE(SUM(jl.credit_amount) - SUM(jl.debit_amount), 0)
            ELSE COALESCE(SUM(jl.debit_amount) - SUM(jl.credit_amount), 0)
          END AS amount
        FROM gl_accounts a
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
          ${locationFilter}
          ${profitCenterFilter}
          ${subDepartmentFilter}
          ${channelFilter}
        LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.tenant_id = ${input.tenantId}
          AND je.business_date >= ${from}
          AND je.business_date <= ${to}
        WHERE a.tenant_id = ${input.tenantId}
          AND a.is_active = true
          AND a.account_type IN ('revenue', 'expense')
        GROUP BY a.id, a.account_number, a.name, a.account_type, a.is_contra_account, c.name
        HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
            OR COALESCE(SUM(jl.credit_amount), 0) != 0
        ORDER BY a.account_number
      `);

      const accountRows = Array.from(rows as Iterable<Record<string, unknown>>);

      // Group by classification into sections.
      // Contra-revenue accounts (e.g., Returns & Allowances) are shown
      // as deductions under revenue with a "Less:" prefix.
      const revenueSections = new Map<string, PnlAccountLine[]>();
      const contraRevenueSections = new Map<string, PnlAccountLine[]>();
      const expenseSections = new Map<string, PnlAccountLine[]>();
      let grossRevenue = 0;
      let contraRevenue = 0;
      let totalExpenses = 0;

      for (const row of accountRows) {
        const isContra = Boolean(row.is_contra_account);
        const rawAmount = Number(row.amount);

        const line: PnlAccountLine = {
          accountId: String(row.account_id),
          accountNumber: String(row.account_number),
          accountName: String(row.account_name),
          classificationName: row.classification_name ? String(row.classification_name) : null,
          isContraAccount: isContra,
          amount: rawAmount,
        };

        const classLabel = line.classificationName ?? String(row.account_type);

        if (String(row.account_type) === 'revenue') {
          if (isContra) {
            // Contra-revenue: amount is (credits - debits). For a returns
            // account that gets debited, this is negative. We display it
            // as a deduction under revenue.
            contraRevenue += rawAmount;
            const label = `Less: ${classLabel}`;
            const arr = contraRevenueSections.get(label) ?? [];
            arr.push(line);
            contraRevenueSections.set(label, arr);
          } else {
            grossRevenue += rawAmount;
            const arr = revenueSections.get(classLabel) ?? [];
            arr.push(line);
            revenueSections.set(classLabel, arr);
          }
        } else {
          totalExpenses += rawAmount;
          const arr = expenseSections.get(classLabel) ?? [];
          arr.push(line);
          expenseSections.set(classLabel, arr);
        }
      }

      grossRevenue = Math.round(grossRevenue * 100) / 100;
      contraRevenue = Math.round(contraRevenue * 100) / 100;
      totalExpenses = Math.round(totalExpenses * 100) / 100;
      // totalRevenue = gross + contra (contra is typically negative)
      const totalRevenue = Math.round((grossRevenue + contraRevenue) * 100) / 100;

      const sections: PnlSection[] = [];

      // Revenue sections (gross)
      for (const [label, accounts] of revenueSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }

      // Contra-revenue sections (deductions)
      for (const [label, accounts] of contraRevenueSections) {
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

      return {
        sections,
        grossRevenue,
        contraRevenue,
        totalRevenue,
        totalExpenses,
        netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      };
    }

    const dimensionFilters = {
      locationId: input.locationId,
      profitCenterId: input.profitCenterId,
      subDepartmentId: input.subDepartmentId,
      channel: input.channel,
    };
    const current = await computePnl(input.from, input.to, dimensionFilters);

    const result: ProfitAndLoss = {
      period: { from: input.from, to: input.to },
      locationId: input.locationId ?? null,
      sections: current.sections,
      grossRevenue: current.grossRevenue,
      contraRevenue: current.contraRevenue,
      totalRevenue: current.totalRevenue,
      totalExpenses: current.totalExpenses,
      netIncome: current.netIncome,
    };

    // Comparative period
    if (input.comparativeFrom && input.comparativeTo) {
      const comparative = await computePnl(input.comparativeFrom, input.comparativeTo, dimensionFilters);
      result.comparativePeriod = { from: input.comparativeFrom, to: input.comparativeTo };
      result.comparativeSections = comparative.sections;
      result.comparativeNetIncome = comparative.netIncome;
    }

    return result;
  });
}
