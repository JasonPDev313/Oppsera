import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GlDetailLine {
  lineId: string;
  journalEntryId: string;
  journalNumber: number;
  businessDate: string;
  sourceModule: string;
  sourceReferenceId: string | null;
  memo: string | null;
  entryMemo: string | null;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  locationId: string | null;
  departmentId: string | null;
  customerId: string | null;
  vendorId: string | null;
}

interface GetGlDetailReportInput {
  tenantId: string;
  accountId: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
}

export async function getGlDetailReport(
  input: GetGlDetailReportInput,
): Promise<{ items: GlDetailLine[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const startDateFilter = input.startDate
      ? sql`AND je.business_date >= ${input.startDate}`
      : sql``;

    const endDateFilter = input.endDate
      ? sql`AND je.business_date <= ${input.endDate}`
      : sql``;

    const locationFilter = input.locationId
      ? sql`AND jl.location_id = ${input.locationId}`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND jl.id < ${input.cursor}`
      : sql``;

    // Use a window function to compute running balance.
    // The running balance is calculated based on the account's normal balance direction.
    // We order by business_date ASC, journal_number ASC, sort_order ASC for chronological running balance,
    // then return results ordered by id DESC for cursor pagination.
    const rows = await tx.execute(sql`
      WITH detail AS (
        SELECT
          jl.id AS line_id,
          je.id AS journal_entry_id,
          je.journal_number,
          je.business_date,
          je.source_module,
          je.source_reference_id,
          jl.memo,
          je.memo AS entry_memo,
          jl.debit_amount,
          jl.credit_amount,
          jl.location_id,
          jl.department_id,
          jl.customer_id,
          jl.vendor_id,
          SUM(
            CASE WHEN a.normal_balance = 'debit'
              THEN jl.debit_amount - jl.credit_amount
              ELSE jl.credit_amount - jl.debit_amount
            END
          ) OVER (
            ORDER BY je.business_date ASC, je.journal_number ASC, jl.sort_order ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_balance
        FROM gl_journal_lines jl
        INNER JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        INNER JOIN gl_accounts a ON a.id = jl.account_id
        WHERE jl.account_id = ${input.accountId}
          AND je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
          ${startDateFilter}
          ${endDateFilter}
          ${locationFilter}
      )
      SELECT *
      FROM detail
      WHERE 1 = 1
        ${cursorFilter}
      ORDER BY line_id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    const mapped = items.map((row) => ({
      lineId: String(row.line_id),
      journalEntryId: String(row.journal_entry_id),
      journalNumber: Number(row.journal_number),
      businessDate: String(row.business_date),
      sourceModule: String(row.source_module),
      sourceReferenceId: row.source_reference_id ? String(row.source_reference_id) : null,
      memo: row.memo ? String(row.memo) : null,
      entryMemo: row.entry_memo ? String(row.entry_memo) : null,
      debitAmount: Number(row.debit_amount),
      creditAmount: Number(row.credit_amount),
      runningBalance: Number(row.running_balance),
      locationId: row.location_id ? String(row.location_id) : null,
      departmentId: row.department_id ? String(row.department_id) : null,
      customerId: row.customer_id ? String(row.customer_id) : null,
      vendorId: row.vendor_id ? String(row.vendor_id) : null,
    }));

    return {
      items: mapped,
      cursor: hasMore ? mapped[mapped.length - 1]!.lineId : null,
      hasMore,
    };
  });
}
