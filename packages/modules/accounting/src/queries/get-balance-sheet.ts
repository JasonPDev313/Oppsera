import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface BsAccountLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  classificationName: string | null;
  amount: number;
}

export interface BsSection {
  label: string;
  accounts: BsAccountLine[];
  subtotal: number;
}

export interface BalanceSheet {
  asOfDate: string;
  locationId: string | null;
  assets: BsSection[];
  liabilities: BsSection[];
  equity: BsSection[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
  currentYearNetIncome: number;
}

interface GetBalanceSheetInput {
  tenantId: string;
  asOfDate: string;
  locationId?: string;
}

export async function getBalanceSheet(input: GetBalanceSheetInput): Promise<BalanceSheet> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND jl.location_id = ${input.locationId}`
      : sql``;

    // 1. Get all balance sheet account balances as of date
    // NOTE: The (jl.id IS NULL OR je.id IS NOT NULL) guard ensures lines from
    // non-posted entries (draft/error/voided) are excluded from balance calculations.
    // Without it, the LEFT JOIN on je with status='posted' filter in ON clause would
    // leave jl values intact for non-posted entries, corrupting the SUM.
    const rows = await tx.execute(sql`
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name AS account_name,
        a.account_type,
        a.normal_balance,
        COALESCE(c.name, a.account_type) AS classification_name,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
          ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
        END AS balance
      FROM gl_accounts a
      LEFT JOIN gl_classifications c ON c.id = a.classification_id
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
        ${locationFilter}
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        AND je.business_date <= ${input.asOfDate}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND a.account_type IN ('asset', 'liability', 'equity')
        AND (jl.id IS NULL OR je.id IS NOT NULL)
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance, c.name
      HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
          OR COALESCE(SUM(jl.credit_amount), 0) != 0
      ORDER BY a.account_number
    `);

    const accountRows = Array.from(rows as Iterable<Record<string, unknown>>);

    // 2. Compute current year net income (for retained earnings inclusion)
    // Get fiscal year start from settings
    const settingsRows = await tx.execute(sql`
      SELECT fiscal_year_start_month FROM accounting_settings
      WHERE tenant_id = ${input.tenantId} LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const fyStartMonth = settingsArr.length > 0 ? Number(settingsArr[0]!.fiscal_year_start_month) : 1;

    const asOfYear = parseInt(input.asOfDate.substring(0, 4));
    const asOfMonth = parseInt(input.asOfDate.substring(5, 7));
    const fyStartYear = asOfMonth >= fyStartMonth ? asOfYear : asOfYear - 1;
    const fyStartDate = `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}-01`;

    const incomeRows = await tx.execute(sql`
      SELECT
        COALESCE(
          SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit_amount - jl.debit_amount ELSE 0 END), 0
        ) AS total_revenue,
        COALESCE(
          SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit_amount - jl.credit_amount ELSE 0 END), 0
        ) AS total_expenses
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      JOIN gl_accounts a ON a.id = jl.account_id
      WHERE je.tenant_id = ${input.tenantId}
        AND je.status = 'posted'
        AND je.business_date >= ${fyStartDate}
        AND je.business_date <= ${input.asOfDate}
        AND a.account_type IN ('revenue', 'expense')
    `);
    const incArr = Array.from(incomeRows as Iterable<Record<string, unknown>>);
    const totalRevenue = incArr.length > 0 ? Number(incArr[0]!.total_revenue) : 0;
    const totalExpenses = incArr.length > 0 ? Number(incArr[0]!.total_expenses) : 0;
    const currentYearNetIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

    // 3. Group accounts into sections
    const assetSections = new Map<string, BsAccountLine[]>();
    const liabilitySections = new Map<string, BsAccountLine[]>();
    const equitySections = new Map<string, BsAccountLine[]>();
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const row of accountRows) {
      const line: BsAccountLine = {
        accountId: String(row.account_id),
        accountNumber: String(row.account_number),
        accountName: String(row.account_name),
        classificationName: row.classification_name ? String(row.classification_name) : null,
        amount: Number(row.balance),
      };

      const classLabel = line.classificationName ?? String(row.account_type);

      switch (String(row.account_type)) {
        case 'asset': {
          totalAssets += line.amount;
          const arr = assetSections.get(classLabel) ?? [];
          arr.push(line);
          assetSections.set(classLabel, arr);
          break;
        }
        case 'liability': {
          totalLiabilities += line.amount;
          const arr = liabilitySections.get(classLabel) ?? [];
          arr.push(line);
          liabilitySections.set(classLabel, arr);
          break;
        }
        case 'equity': {
          totalEquity += line.amount;
          const arr = equitySections.get(classLabel) ?? [];
          arr.push(line);
          equitySections.set(classLabel, arr);
          break;
        }
      }
    }

    // Add current year net income to equity
    totalEquity += currentYearNetIncome;
    totalEquity = Math.round(totalEquity * 100) / 100;
    totalAssets = Math.round(totalAssets * 100) / 100;
    totalLiabilities = Math.round(totalLiabilities * 100) / 100;

    const toSections = (map: Map<string, BsAccountLine[]>): BsSection[] => {
      const sections: BsSection[] = [];
      for (const [label, accounts] of map) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }
      return sections;
    };

    return {
      asOfDate: input.asOfDate,
      locationId: input.locationId ?? null,
      assets: toSections(assetSections),
      liabilities: toSections(liabilitySections),
      equity: toSections(equitySections),
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      currentYearNetIncome,
    };
  });
}
