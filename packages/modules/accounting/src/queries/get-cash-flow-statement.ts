import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ──────────────────────────────────────────────────────

export interface CashFlowLineItem {
  label: string;
  amount: number;
}

export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operatingActivities: CashFlowLineItem[];
  netCashFromOperations: number;
  investingActivities: CashFlowLineItem[];
  netCashFromInvesting: number;
  financingActivities: CashFlowLineItem[];
  netCashFromFinancing: number;
  netChangeInCash: number;
  beginningCashBalance: number;
  endingCashBalance: number;
}

interface GetCashFlowInput {
  tenantId: string;
  from: string;
  to: string;
}

// ── Classification → Cash Flow Section mapping ─────────────────
// Based on gl_classification_templates seeded in migrations 0075 + 0238.
// Tenants may add custom classifications; unknown ones fall back to
// heuristics based on account type and name patterns.

type CfSection = 'cash' | 'operating' | 'investing' | 'financing' | 'skip';

const CLASSIFICATION_MAP: Record<string, CfSection> = {
  // Assets
  'cash & bank': 'cash',
  'receivables': 'operating',
  'inventory': 'operating',
  'prepaid & other current': 'operating',
  'current assets': 'operating',
  'fixed assets': 'investing',
  // Liabilities
  'payables': 'operating',
  'tax liabilities': 'operating',
  'deferred revenue': 'operating',
  'accrued liabilities': 'operating',
  'current liabilities': 'operating',
  // Equity
  'owner equity': 'financing',
  'retained earnings': 'skip', // covered by net income
};

function classifyAccount(
  accountType: string,
  classificationName: string | null,
  controlAccountType: string | null,
  accountName: string,
): CfSection {
  // control_account_type = 'bank' is the authoritative cash marker
  if (controlAccountType === 'bank') return 'cash';

  // Try exact classification match
  if (classificationName) {
    const key = classificationName.toLowerCase();
    if (CLASSIFICATION_MAP[key] !== undefined) {
      return CLASSIFICATION_MAP[key];
    }
  }

  // Heuristic fallbacks for custom/unknown classifications
  const lowerName = (classificationName || accountName).toLowerCase();

  if (/\bcash\b|\bbank\b|\bchecking\b|\bsavings\b|\bmoney market\b/.test(lowerName)) {
    return 'cash';
  }
  if (/\bretained earnings\b/.test(lowerName)) {
    return 'skip';
  }

  switch (accountType) {
    case 'asset':
      if (/\bfixed\b|\bproperty\b|\bequipment\b|\bfurniture\b|\bvehicle\b|\bintangible\b|\bgoodwill\b|\baccumulated depreciation\b|\blong.?term\b/.test(lowerName)) {
        return 'investing';
      }
      return 'operating';
    case 'liability':
      if (/\blong.?term\b|\bloan\b|\bnote.?payable\b|\bmortgage\b|\bbond\b|\bdebt\b/.test(lowerName)) {
        return 'financing';
      }
      return 'operating';
    case 'equity':
      return 'financing';
    default:
      return 'operating';
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Merge items with the same label, summing amounts. */
function mergeItems(items: CashFlowLineItem[]): CashFlowLineItem[] {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.label, (map.get(item.label) ?? 0) + item.amount);
  }
  const merged: CashFlowLineItem[] = [];
  for (const [label, amount] of map) {
    const rounded = round2(amount);
    if (rounded !== 0) merged.push({ label, amount: rounded });
  }
  return merged;
}

// ── Main Query ─────────────────────────────────────────────────

export async function getCashFlowStatement(input: GetCashFlowInput): Promise<CashFlowStatement> {
  return withTenant(input.tenantId, async (tx) => {
    // Fire independent queries in parallel:
    // Q1 = net income + depreciation, Q2 = balance sheet changes, Q3 = beginning cash
    const [incomeRows, balanceRows, beginRows] = await Promise.all([
      // Q1: Net income + depreciation for the period
      tx.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN a.account_type = 'revenue'
            THEN (jl.credit_amount - jl.debit_amount) * COALESCE(je.exchange_rate, 1) ELSE 0 END), 0) AS revenue,
          COALESCE(SUM(CASE WHEN a.account_type = 'expense'
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1) ELSE 0 END), 0) AS expenses,
          COALESCE(SUM(CASE WHEN a.account_type = 'expense'
            AND (LOWER(a.name) LIKE '%depreciation%' OR LOWER(a.name) LIKE '%amortization%'
              OR LOWER(COALESCE(c2.name, '')) LIKE '%depreciation%' OR LOWER(COALESCE(c2.name, '')) LIKE '%amortization%')
            THEN (jl.debit_amount - jl.credit_amount) * COALESCE(je.exchange_rate, 1) ELSE 0 END), 0) AS depreciation
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        LEFT JOIN gl_classifications c2 ON c2.id = a.classification_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${input.from}
          AND je.business_date <= ${input.to}
          AND a.account_type IN ('revenue', 'expense')
      `),

      // Q2: Balance changes for all balance sheet accounts over the period.
      //     Includes control_account_type for authoritative cash detection.
      tx.execute(sql`
        SELECT
          a.name AS account_name,
          a.account_type,
          a.control_account_type,
          COALESCE(NULLIF(c.name, ''), NULL) AS classification_name,
          CASE WHEN a.normal_balance = 'debit'
            THEN COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
               - COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
            ELSE COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
               - COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
          END AS balance_change
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${input.from}
          AND je.business_date <= ${input.to}
          AND a.account_type IN ('asset', 'liability', 'equity')
        GROUP BY a.id, a.name, a.account_type, a.normal_balance, a.control_account_type, c.name
        HAVING COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
            OR COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
        ORDER BY a.account_type, c.name, a.name
      `),

      // Q3: Beginning cash balance — uses control_account_type='bank' as primary
      //     indicator, with classification + name fallbacks.
      tx.execute(sql`
        SELECT
          COALESCE(SUM(
            CASE WHEN a.normal_balance = 'debit'
              THEN jl.debit_amount * COALESCE(je.exchange_rate, 1) - jl.credit_amount * COALESCE(je.exchange_rate, 1)
              ELSE jl.credit_amount * COALESCE(je.exchange_rate, 1) - jl.debit_amount * COALESCE(je.exchange_rate, 1)
            END
          ), 0) AS balance
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.tenant_id = ${input.tenantId}
          AND je.business_date < ${input.from}
        JOIN gl_accounts a ON a.id = jl.account_id
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        WHERE a.tenant_id = ${input.tenantId}
          AND a.account_type = 'asset'
          AND (
            a.control_account_type = 'bank'
            OR LOWER(COALESCE(c.name, '')) = 'cash & bank'
          )
      `),
    ]);

    // Parse Q1: net income + depreciation
    const incArr = Array.from(incomeRows as Iterable<Record<string, unknown>>);
    const netIncome = round2(Number(incArr[0]?.revenue ?? 0) - Number(incArr[0]?.expenses ?? 0));
    const depreciation = round2(Number(incArr[0]?.depreciation ?? 0));

    // Parse Q2: classify each account's balance change
    const rows = Array.from(balanceRows as Iterable<Record<string, unknown>>);
    const operatingRaw: CashFlowLineItem[] = [];
    const investingRaw: CashFlowLineItem[] = [];
    const financingRaw: CashFlowLineItem[] = [];

    for (const row of rows) {
      const accountType = String(row.account_type);
      const classificationName = row.classification_name ? String(row.classification_name) : null;
      const controlAccountType = row.control_account_type ? String(row.control_account_type) : null;
      const accountName = String(row.account_name);
      const change = round2(Number(row.balance_change));
      if (change === 0) continue;

      const section = classifyAccount(accountType, classificationName, controlAccountType, accountName);
      if (section === 'cash' || section === 'skip') continue;

      // Indirect method: asset increase uses cash (negative), liability/equity increase provides cash (positive)
      const cashImpact = accountType === 'asset' ? -change : change;

      switch (section) {
        case 'operating':
          operatingRaw.push({ label: accountName, amount: round2(cashImpact) });
          break;
        case 'investing':
          investingRaw.push({ label: accountName, amount: round2(cashImpact) });
          break;
        case 'financing':
          financingRaw.push({ label: accountName, amount: round2(cashImpact) });
          break;
      }
    }

    // Merge duplicate account names (e.g. multi-location same-name accounts)
    const operating = mergeItems(operatingRaw);
    const investing = mergeItems(investingRaw);
    const financing = mergeItems(financingRaw);

    // Build operating activities (indirect method: net income first)
    const operatingActivities: CashFlowLineItem[] = [
      { label: 'Net Income', amount: netIncome },
    ];
    if (depreciation !== 0) {
      operatingActivities.push({ label: 'Depreciation & Amortization', amount: depreciation });
    }
    operatingActivities.push(...operating);

    const netCashFromOperations = round2(
      operatingActivities.reduce((sum, i) => sum + i.amount, 0),
    );
    const netCashFromInvesting = round2(
      investing.reduce((sum, i) => sum + i.amount, 0),
    );
    const netCashFromFinancing = round2(
      financing.reduce((sum, i) => sum + i.amount, 0),
    );
    const netChangeInCash = round2(netCashFromOperations + netCashFromInvesting + netCashFromFinancing);

    // Parse Q3: beginning cash balance
    const beginArr = Array.from(beginRows as Iterable<Record<string, unknown>>);
    const beginningCashBalance = round2(Number(beginArr[0]?.balance ?? 0));
    const endingCashBalance = round2(beginningCashBalance + netChangeInCash);

    return {
      periodStart: input.from,
      periodEnd: input.to,
      operatingActivities,
      netCashFromOperations,
      investingActivities: investing,
      netCashFromInvesting,
      financingActivities: financing,
      netCashFromFinancing,
      netChangeInCash,
      beginningCashBalance,
      endingCashBalance,
    };
  });
}
