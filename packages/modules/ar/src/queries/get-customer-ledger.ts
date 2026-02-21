import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CustomerLedgerEntry {
  date: string;
  type: 'invoice' | 'receipt';
  referenceNumber: string;
  description: string | null;
  amount: number;
  balance: number;
}

export interface CustomerLedgerResult {
  customerId: string;
  openingBalance: number;
  closingBalance: number;
  entries: CustomerLedgerEntry[];
}

interface GetCustomerLedgerInput {
  tenantId: string;
  customerId: string;
  fromDate?: string;
  toDate?: string;
}

export async function getCustomerLedger(input: GetCustomerLedgerInput): Promise<CustomerLedgerResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Build date filters for the main union query
    const dateFilters = [];
    if (input.fromDate) dateFilters.push(sql`entry_date >= ${input.fromDate}`);
    if (input.toDate) dateFilters.push(sql`entry_date <= ${input.toDate}`);
    const dateWhere = dateFilters.length > 0
      ? sql` AND ${sql.join(dateFilters, sql` AND `)}`
      : sql``;

    // Union of invoices and receipts
    const rows = await tx.execute(sql`
      SELECT * FROM (
        SELECT
          invoice_date AS entry_date,
          'invoice' AS entry_type,
          invoice_number AS reference_number,
          memo AS description,
          total_amount::numeric AS amount
        FROM ar_invoices
        WHERE tenant_id = ${input.tenantId}
          AND customer_id = ${input.customerId}
          AND status IN ('posted', 'partial', 'paid')
          ${dateWhere}
        UNION ALL
        SELECT
          receipt_date AS entry_date,
          'receipt' AS entry_type,
          COALESCE(reference_number, 'RCP-' || SUBSTRING(id, LENGTH(id) - 7)) AS reference_number,
          payment_method AS description,
          -amount::numeric AS amount
        FROM ar_receipts
        WHERE tenant_id = ${input.tenantId}
          AND customer_id = ${input.customerId}
          AND status = 'posted'
          ${dateWhere}
      ) combined
      ORDER BY entry_date ASC, entry_type ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    // Compute opening balance (everything before fromDate)
    let openingBalance = 0;
    if (input.fromDate) {
      const obRows = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0) AS inv_total
        FROM ar_invoices
        WHERE tenant_id = ${input.tenantId}
          AND customer_id = ${input.customerId}
          AND status IN ('posted', 'partial', 'paid')
          AND invoice_date < ${input.fromDate}
      `);
      const obArr = Array.from(obRows as Iterable<Record<string, unknown>>);
      const invTotal = obArr.length > 0 ? Number(obArr[0]!.inv_total) : 0;

      const rcpRows = await tx.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS rcp_total
        FROM ar_receipts
        WHERE tenant_id = ${input.tenantId}
          AND customer_id = ${input.customerId}
          AND status = 'posted'
          AND receipt_date < ${input.fromDate}
      `);
      const rcpArr = Array.from(rcpRows as Iterable<Record<string, unknown>>);
      const rcpTotal = rcpArr.length > 0 ? Number(rcpArr[0]!.rcp_total) : 0;

      openingBalance = invTotal - rcpTotal;
    }

    let runningBalance = openingBalance;
    const entries: CustomerLedgerEntry[] = arr.map((r) => {
      const amount = Number(r.amount);
      runningBalance += amount;
      return {
        date: String(r.entry_date),
        type: String(r.entry_type) as 'invoice' | 'receipt',
        referenceNumber: String(r.reference_number),
        description: r.description ? String(r.description) : null,
        amount,
        balance: Math.round(runningBalance * 100) / 100,
      };
    });

    return {
      customerId: input.customerId,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(runningBalance * 100) / 100,
      entries,
    };
  });
}
