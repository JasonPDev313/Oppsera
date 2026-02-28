import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GlCodeSummaryLine {
  section: 'revenue' | 'tender' | 'tax' | 'tip' | 'discount' | 'expense' | 'other';
  memo: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountDisplay: string;
  totalDebit: number;
  totalCredit: number;
}

export interface GlCodeSummaryResult {
  lines: GlCodeSummaryLine[];
  grandTotalDebit: number;
  grandTotalCredit: number;
}

interface GetGlCodeSummaryInput {
  tenantId: string;
  startDate: string;
  endDate: string;
  locationId?: string;
}

/**
 * GL Code Summary report — groups all posted GL activity by memo + account
 * for a date range, classified into sections (revenue, tender, tax, etc.).
 *
 * This is the standard end-of-day reconciliation report used in golf/hospitality
 * to verify that POS activity posted correctly to the GL.
 */
export async function getGlCodeSummary(
  input: GetGlCodeSummaryInput,
): Promise<GlCodeSummaryResult> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND jl.location_id = ${input.locationId}`
      : sql``;

    // The query:
    // 1. JOINs journal lines → entries → accounts
    // 2. LEFT JOINs catalog_categories to resolve sub-department names for revenue lines
    // 3. Builds a display memo from category hierarchy (parent - child) with fallback to raw memo
    // 4. Classifies each line into a section by account_type + memo keywords
    // 5. Groups by account + display memo, sums debits/credits
    // 6. Orders by section priority, then account number, then memo
    const rows = await tx.execute(sql`
      WITH raw_lines AS (
        SELECT
          a.id AS account_id,
          a.account_number,
          a.name AS account_name,
          a.account_type,
          jl.memo AS line_memo,
          je.memo AS entry_memo,
          jl.sub_department_id,
          CAST(jl.debit_amount AS NUMERIC) AS debit_amt,
          CAST(jl.credit_amount AS NUMERIC) AS credit_amt,
          -- Resolve category hierarchy for display
          cat.name AS cat_name,
          parent_cat.name AS parent_cat_name
        FROM gl_journal_lines jl
        INNER JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        INNER JOIN gl_accounts a ON a.id = jl.account_id
        LEFT JOIN catalog_categories cat ON cat.id = jl.sub_department_id
        LEFT JOIN catalog_categories parent_cat ON parent_cat.id = cat.parent_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          AND je.business_date >= ${input.startDate}
          AND je.business_date <= ${input.endDate}
          ${locationFilter}
      ),
      classified AS (
        SELECT
          account_id,
          account_number,
          account_name,
          account_type,
          -- Build display memo: prefer category hierarchy, fallback to line/entry memo
          CASE
            WHEN parent_cat_name IS NOT NULL AND cat_name IS NOT NULL
              THEN parent_cat_name || ' - ' || cat_name
            WHEN cat_name IS NOT NULL
              THEN cat_name
            WHEN line_memo IS NOT NULL AND line_memo <> ''
              THEN line_memo
            WHEN entry_memo IS NOT NULL AND entry_memo <> ''
              THEN entry_memo
            ELSE 'Unspecified'
          END AS display_memo,
          debit_amt,
          credit_amt,
          -- Classify section
          CASE
            WHEN account_type = 'revenue' AND (
              line_memo ILIKE '%discount%' OR line_memo ILIKE '%Discount%'
            ) THEN 'discount'
            WHEN account_type = 'revenue' THEN 'revenue'
            WHEN line_memo ILIKE '%tip%' OR line_memo ILIKE '%Tips%' THEN 'tip'
            WHEN account_type = 'liability' AND (
              account_name ILIKE '%tax%' OR line_memo ILIKE '%tax%'
            ) THEN 'tax'
            WHEN account_type IN ('asset', 'liability') THEN 'tender'
            WHEN account_type = 'expense' THEN 'expense'
            ELSE 'other'
          END AS section
        FROM raw_lines
      )
      SELECT
        section,
        display_memo,
        account_id,
        account_number,
        account_name,
        SUM(debit_amt) AS total_debit,
        SUM(credit_amt) AS total_credit
      FROM classified
      GROUP BY section, display_memo, account_id, account_number, account_name
      ORDER BY
        CASE section
          WHEN 'revenue' THEN 1
          WHEN 'discount' THEN 2
          WHEN 'tender' THEN 3
          WHEN 'tax' THEN 4
          WHEN 'tip' THEN 5
          WHEN 'expense' THEN 6
          ELSE 7
        END,
        account_number,
        display_memo
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    const lines: GlCodeSummaryLine[] = allRows.map((row) => {
      const totalDebit = Number(row.total_debit);
      const totalCredit = Number(row.total_credit);
      grandTotalDebit += totalDebit;
      grandTotalCredit += totalCredit;

      const accountNumber = String(row.account_number);
      const accountName = String(row.account_name);

      return {
        section: String(row.section) as GlCodeSummaryLine['section'],
        memo: String(row.display_memo),
        accountId: String(row.account_id),
        accountNumber,
        accountName,
        accountDisplay: `${accountNumber} - ${accountName}`,
        totalDebit,
        totalCredit,
      };
    });

    return {
      lines,
      grandTotalDebit,
      grandTotalCredit,
    };
  });
}
