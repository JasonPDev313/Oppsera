import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { BankReconciliation, BankReconciliationItem } from '../commands/manage-bank-reconciliation';

// ── List Reconciliations ─────────────────────────────────────

interface ListInput {
  tenantId: string;
  bankAccountId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface BankReconciliationListItem {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  glAccountNumber: string;
  statementDate: string;
  statementEndingBalance: string;
  beginningBalance: string;
  difference: string;
  status: string;
  reconciledBy: string | null;
  completedAt: string | null;
  itemCount: number;
  clearedCount: number;
  createdAt: string;
}

export async function listBankReconciliations(
  input: ListInput,
): Promise<{ items: BankReconciliationListItem[]; cursor: string | null; hasMore: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const limit = input.limit ?? 50;

    // Build conditions — note: we use parameterized queries below
    const bankAccountFilter = input.bankAccountId
      ? sql` AND br.bank_account_id = ${input.bankAccountId}`
      : sql``;
    const statusFilter = input.status
      ? sql` AND br.status = ${input.status}`
      : sql``;
    const cursorFilter = input.cursor
      ? sql` AND br.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        br.id,
        br.bank_account_id,
        ba.name AS bank_account_name,
        ga.account_number AS gl_account_number,
        br.statement_date,
        br.statement_ending_balance,
        br.beginning_balance,
        br.difference,
        br.status,
        br.reconciled_by,
        br.completed_at,
        br.created_at,
        (SELECT COUNT(*)::int FROM bank_reconciliation_items bri WHERE bri.reconciliation_id = br.id) AS item_count,
        (SELECT COUNT(*)::int FROM bank_reconciliation_items bri WHERE bri.reconciliation_id = br.id AND bri.is_cleared = true) AS cleared_count
      FROM bank_reconciliations br
      JOIN bank_accounts ba ON ba.id = br.bank_account_id
      JOIN gl_accounts ga ON ga.id = ba.gl_account_id
      WHERE br.tenant_id = ${input.tenantId}
        ${bankAccountFilter}
        ${statusFilter}
        ${cursorFilter}
      ORDER BY br.statement_date DESC, br.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = (hasMore ? arr.slice(0, limit) : arr).map((row) => ({
      id: String(row.id),
      bankAccountId: String(row.bank_account_id),
      bankAccountName: String(row.bank_account_name),
      glAccountNumber: String(row.gl_account_number),
      statementDate: String(row.statement_date),
      statementEndingBalance: String(row.statement_ending_balance),
      beginningBalance: String(row.beginning_balance),
      difference: String(row.difference),
      status: String(row.status),
      reconciledBy: row.reconciled_by ? String(row.reconciled_by) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      itemCount: Number(row.item_count ?? 0),
      clearedCount: Number(row.cleared_count ?? 0),
      createdAt: String(row.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── Get Reconciliation with Items ────────────────────────────

interface GetInput {
  tenantId: string;
  reconciliationId: string;
}

export interface BankReconciliationDetail extends BankReconciliation {
  items: BankReconciliationItem[];
}

export async function getBankReconciliation(
  input: GetInput,
): Promise<BankReconciliationDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Get reconciliation header
    const headerRows = await tx.execute(sql`
      SELECT
        br.*,
        ba.name AS bank_account_name,
        ba.gl_account_id
      FROM bank_reconciliations br
      JOIN bank_accounts ba ON ba.id = br.bank_account_id
      WHERE br.id = ${input.reconciliationId}
        AND br.tenant_id = ${input.tenantId}
    `);

    const headerArr = Array.from(headerRows as Iterable<Record<string, unknown>>);
    if (headerArr.length === 0) return null;

    const h = headerArr[0]!;

    // Get items
    const itemRows = await tx.execute(sql`
      SELECT
        bri.*,
        je.journal_number,
        je.memo AS journal_memo,
        je.source_module
      FROM bank_reconciliation_items bri
      LEFT JOIN gl_journal_lines jl ON jl.id = bri.gl_journal_line_id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      WHERE bri.reconciliation_id = ${input.reconciliationId}
        AND bri.tenant_id = ${input.tenantId}
      ORDER BY bri.date ASC, bri.created_at ASC
    `);

    const itemArr = Array.from(itemRows as Iterable<Record<string, unknown>>);

    const items: BankReconciliationItem[] = itemArr.map((row) => ({
      id: String(row.id),
      reconciliationId: String(row.reconciliation_id),
      glJournalLineId: row.gl_journal_line_id ? String(row.gl_journal_line_id) : null,
      itemType: String(row.item_type),
      amount: String(row.amount),
      date: String(row.date),
      description: row.description ? String(row.description) : null,
      isCleared: Boolean(row.is_cleared),
      clearedDate: row.cleared_date ? String(row.cleared_date) : null,
      glJournalEntryId: row.gl_journal_entry_id ? String(row.gl_journal_entry_id) : null,
      journalNumber: row.journal_number ? Number(row.journal_number) : null,
      journalMemo: row.journal_memo ? String(row.journal_memo) : null,
      sourceModule: row.source_module ? String(row.source_module) : null,
      createdAt: String(row.created_at),
    }));

    return {
      id: String(h.id),
      tenantId: String(h.tenant_id),
      bankAccountId: String(h.bank_account_id),
      bankAccountName: h.bank_account_name ? String(h.bank_account_name) : null,
      glAccountId: h.gl_account_id ? String(h.gl_account_id) : null,
      statementDate: String(h.statement_date),
      statementEndingBalance: String(h.statement_ending_balance),
      beginningBalance: String(h.beginning_balance),
      status: String(h.status),
      clearedBalance: String(h.cleared_balance),
      outstandingDeposits: String(h.outstanding_deposits),
      outstandingWithdrawals: String(h.outstanding_withdrawals),
      adjustmentTotal: String(h.adjustment_total),
      difference: String(h.difference),
      reconciledBy: h.reconciled_by ? String(h.reconciled_by) : null,
      completedAt: h.completed_at ? String(h.completed_at) : null,
      notes: h.notes ? String(h.notes) : null,
      createdAt: String(h.created_at),
      updatedAt: String(h.updated_at),
      items,
    };
  });
}
