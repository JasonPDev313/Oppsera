import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ListBillsInput {
  tenantId: string;
  vendorId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
}

export interface BillListItem {
  id: string;
  vendorId: string;
  vendorName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  locationId: string | null;
  vendorInvoiceNumber: string | null;
  memo: string | null;
  createdAt: string;
}

export interface ListBillsResult {
  items: BillListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listBills(input: ListBillsInput): Promise<ListBillsResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`b.tenant_id = ${input.tenantId}`,
    ];

    if (input.cursor) {
      conditions.push(sql`b.id < ${input.cursor}`);
    }
    if (input.vendorId) {
      conditions.push(sql`b.vendor_id = ${input.vendorId}`);
    }
    if (input.status) {
      conditions.push(sql`b.status = ${input.status}`);
    }
    if (input.startDate) {
      conditions.push(sql`b.bill_date >= ${input.startDate}`);
    }
    if (input.endDate) {
      conditions.push(sql`b.bill_date <= ${input.endDate}`);
    }
    if (input.locationId) {
      conditions.push(sql`b.location_id = ${input.locationId}`);
    }
    if (input.overdue) {
      conditions.push(sql`b.due_date < CURRENT_DATE`);
      conditions.push(sql`b.status IN ('posted', 'partial')`);
    }

    const whereClause = conditions.reduce(
      (acc, cond, i) => (i === 0 ? sql`WHERE ${cond}` : sql`${acc} AND ${cond}`),
      sql``,
    );

    const rows = await tx.execute(sql`
      SELECT
        b.id,
        b.vendor_id,
        v.name AS vendor_name,
        b.bill_number,
        b.bill_date,
        b.due_date,
        b.status,
        b.total_amount,
        COALESCE(
          (SELECT SUM(pa.amount)
           FROM ap_payment_allocations pa
           INNER JOIN ap_payments p ON p.id = pa.payment_id
           WHERE pa.bill_id = b.id AND p.status != 'voided'),
          0
        ) AS paid_amount,
        b.location_id,
        b.vendor_invoice_number,
        b.memo,
        b.created_at
      FROM ap_bills b
      INNER JOIN vendors v ON v.id = b.vendor_id
      ${whereClause}
      ORDER BY b.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    return {
      items: items.map((row) => ({
        id: String(row.id),
        vendorId: String(row.vendor_id),
        vendorName: String(row.vendor_name),
        billNumber: String(row.bill_number),
        billDate: String(row.bill_date),
        dueDate: String(row.due_date),
        status: String(row.status),
        totalAmount: Number(row.total_amount),
        paidAmount: Number(row.paid_amount),
        remainingAmount: Number(row.total_amount) - Number(row.paid_amount),
        locationId: row.location_id ? String(row.location_id) : null,
        vendorInvoiceNumber: row.vendor_invoice_number ? String(row.vendor_invoice_number) : null,
        memo: row.memo ? String(row.memo) : null,
        createdAt: String(row.created_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
