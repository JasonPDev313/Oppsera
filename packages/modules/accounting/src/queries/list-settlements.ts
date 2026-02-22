import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SettlementListItem {
  id: string;
  locationId: string | null;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  chargebackAmount: number;
  status: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  glJournalEntryId: string | null;
  importSource: string;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  notes: string | null;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  createdAt: string;
}

interface ListSettlementsInput {
  tenantId: string;
  status?: string;
  processorName?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export async function listSettlements(
  input: ListSettlementsInput,
): Promise<{ items: SettlementListItem[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const statusFilter = input.status
      ? sql`AND s.status = ${input.status}`
      : sql``;

    const processorFilter = input.processorName
      ? sql`AND s.processor_name = ${input.processorName}`
      : sql``;

    const startDateFilter = input.startDate
      ? sql`AND s.settlement_date >= ${input.startDate}`
      : sql``;

    const endDateFilter = input.endDate
      ? sql`AND s.settlement_date <= ${input.endDate}`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND s.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        s.id,
        s.location_id,
        s.settlement_date,
        s.processor_name,
        s.processor_batch_id,
        s.gross_amount,
        s.fee_amount,
        s.net_amount,
        s.chargeback_amount,
        s.status,
        s.bank_account_id,
        ba.name AS bank_account_name,
        s.gl_journal_entry_id,
        s.import_source,
        s.business_date_from,
        s.business_date_to,
        s.notes,
        s.created_at,
        COALESCE(lc.total_lines, 0) AS total_lines,
        COALESCE(lc.matched_lines, 0) AS matched_lines,
        COALESCE(lc.unmatched_lines, 0) AS unmatched_lines
      FROM payment_settlements s
      LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_lines,
          COUNT(*) FILTER (WHERE psl.status = 'matched') AS matched_lines,
          COUNT(*) FILTER (WHERE psl.status = 'unmatched') AS unmatched_lines
        FROM payment_settlement_lines psl
        WHERE psl.settlement_id = s.id
      ) lc ON true
      WHERE s.tenant_id = ${input.tenantId}
        ${statusFilter}
        ${processorFilter}
        ${startDateFilter}
        ${endDateFilter}
        ${cursorFilter}
      ORDER BY s.settlement_date DESC, s.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((row) => ({
      id: String(row.id),
      locationId: row.location_id ? String(row.location_id) : null,
      settlementDate: String(row.settlement_date),
      processorName: String(row.processor_name),
      processorBatchId: row.processor_batch_id ? String(row.processor_batch_id) : null,
      grossAmount: Number(row.gross_amount),
      feeAmount: Number(row.fee_amount),
      netAmount: Number(row.net_amount),
      chargebackAmount: Number(row.chargeback_amount),
      status: String(row.status),
      bankAccountId: row.bank_account_id ? String(row.bank_account_id) : null,
      bankAccountName: row.bank_account_name ? String(row.bank_account_name) : null,
      glJournalEntryId: row.gl_journal_entry_id ? String(row.gl_journal_entry_id) : null,
      importSource: String(row.import_source),
      businessDateFrom: row.business_date_from ? String(row.business_date_from) : null,
      businessDateTo: row.business_date_to ? String(row.business_date_to) : null,
      notes: row.notes ? String(row.notes) : null,
      totalLines: Number(row.total_lines),
      matchedLines: Number(row.matched_lines),
      unmatchedLines: Number(row.unmatched_lines),
      createdAt: String(row.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
