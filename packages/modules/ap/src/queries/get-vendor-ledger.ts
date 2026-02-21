import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetVendorLedgerInput {
  tenantId: string;
  vendorId: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface VendorLedgerEntry {
  id: string;
  date: string;
  type: 'bill' | 'payment' | 'credit';
  reference: string;
  description: string | null;
  debit: number;    // increases balance (bills)
  credit: number;   // decreases balance (payments, credits)
  status: string;
}

export interface VendorLedgerResult {
  entries: VendorLedgerEntry[];
  openingBalance: number;
  closingBalance: number;
  cursor: string | null;
  hasMore: boolean;
}

export async function getVendorLedger(input: GetVendorLedgerInput): Promise<VendorLedgerResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const dateCondition = input.startDate && input.endDate
      ? sql`AND entry_date BETWEEN ${input.startDate} AND ${input.endDate}`
      : input.startDate
        ? sql`AND entry_date >= ${input.startDate}`
        : input.endDate
          ? sql`AND entry_date <= ${input.endDate}`
          : sql``;

    const cursorCondition = input.cursor ? sql`AND id < ${input.cursor}` : sql``;

    // Compute opening balance (sum of all entries before startDate)
    let openingBalance = 0;
    if (input.startDate) {
      const obResult = await tx.execute(sql`
        SELECT COALESCE(SUM(
          CASE
            WHEN type = 'bill' AND status != 'voided' THEN total_amount::numeric
            WHEN type = 'payment' AND status = 'posted' THEN -amount::numeric
            ELSE 0
          END
        ), 0) AS balance
        FROM (
          SELECT id, 'bill' AS type, bill_date AS entry_date, total_amount, NULL AS amount, status
          FROM ap_bills WHERE tenant_id = ${input.tenantId} AND vendor_id = ${input.vendorId}
          UNION ALL
          SELECT id, 'payment', payment_date, NULL, amount, status
          FROM ap_payments WHERE tenant_id = ${input.tenantId} AND vendor_id = ${input.vendorId}
        ) combined
        WHERE entry_date < ${input.startDate}
      `);
      const obRows = Array.from(obResult as Iterable<Record<string, unknown>>);
      openingBalance = Number(obRows[0]?.balance ?? 0);
    }

    // Combined ledger entries
    const rows = await tx.execute(sql`
      SELECT * FROM (
        SELECT
          b.id,
          b.bill_date AS entry_date,
          CASE WHEN b.total_amount::numeric < 0 THEN 'credit' ELSE 'bill' END AS type,
          b.bill_number AS reference,
          b.memo AS description,
          CASE WHEN b.total_amount::numeric >= 0 THEN b.total_amount::numeric ELSE 0 END AS debit,
          CASE WHEN b.total_amount::numeric < 0 THEN ABS(b.total_amount::numeric) ELSE 0 END AS credit,
          b.status
        FROM ap_bills b
        WHERE b.tenant_id = ${input.tenantId} AND b.vendor_id = ${input.vendorId}

        UNION ALL

        SELECT
          p.id,
          p.payment_date AS entry_date,
          'payment' AS type,
          COALESCE(p.reference_number, 'Payment') AS reference,
          p.memo AS description,
          0 AS debit,
          p.amount::numeric AS credit,
          p.status
        FROM ap_payments p
        WHERE p.tenant_id = ${input.tenantId} AND p.vendor_id = ${input.vendorId}
      ) combined
      WHERE 1=1 ${dateCondition} ${cursorCondition}
      ORDER BY entry_date DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    const entries = items.map((row) => ({
      id: String(row.id),
      date: String(row.entry_date),
      type: String(row.type) as 'bill' | 'payment' | 'credit',
      reference: String(row.reference),
      description: row.description ? String(row.description) : null,
      debit: Number(row.debit),
      credit: Number(row.credit),
      status: String(row.status),
    }));

    // Compute closing balance
    const periodDebits = entries.reduce((s, e) => s + e.debit, 0);
    const periodCredits = entries.reduce((s, e) => s + e.credit, 0);
    const closingBalance = openingBalance + periodDebits - periodCredits;

    return {
      entries,
      openingBalance,
      closingBalance,
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
