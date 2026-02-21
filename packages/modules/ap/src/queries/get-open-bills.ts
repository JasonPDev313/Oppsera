import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetOpenBillsInput {
  tenantId: string;
  vendorId?: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
}

export interface OpenBillItem {
  id: string;
  vendorId: string;
  vendorName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
  agingBucket: string;
}

export interface GetOpenBillsResult {
  items: OpenBillItem[];
  totalBalance: number;
  cursor: string | null;
  hasMore: boolean;
}

export async function getOpenBills(input: GetOpenBillsInput): Promise<GetOpenBillsResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const vendorCondition = input.vendorId ? sql`AND b.vendor_id = ${input.vendorId}` : sql``;
    const locationCondition = input.locationId ? sql`AND b.location_id = ${input.locationId}` : sql``;
    const cursorCondition = input.cursor ? sql`AND b.id < ${input.cursor}` : sql``;

    const rows = await tx.execute(sql`
      SELECT
        b.id,
        b.vendor_id,
        v.name AS vendor_name,
        b.bill_number,
        b.bill_date,
        b.due_date,
        b.total_amount,
        b.balance_due,
        GREATEST(0, CURRENT_DATE - b.due_date::date) AS days_overdue,
        CASE
          WHEN b.due_date::date >= CURRENT_DATE THEN 'Current'
          WHEN CURRENT_DATE - b.due_date::date BETWEEN 1 AND 30 THEN '1-30'
          WHEN CURRENT_DATE - b.due_date::date BETWEEN 31 AND 60 THEN '31-60'
          WHEN CURRENT_DATE - b.due_date::date BETWEEN 61 AND 90 THEN '61-90'
          ELSE '90+'
        END AS aging_bucket
      FROM ap_bills b
      INNER JOIN vendors v ON v.id = b.vendor_id
      WHERE b.tenant_id = ${input.tenantId}
        AND b.status IN ('posted', 'partial')
        AND b.balance_due::numeric > 0
        ${vendorCondition}
        ${locationCondition}
        ${cursorCondition}
      ORDER BY b.due_date ASC, b.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    const mappedItems = items.map((row) => ({
      id: String(row.id),
      vendorId: String(row.vendor_id),
      vendorName: String(row.vendor_name),
      billNumber: String(row.bill_number),
      billDate: String(row.bill_date),
      dueDate: String(row.due_date),
      totalAmount: Number(row.total_amount),
      balanceDue: Number(row.balance_due),
      daysOverdue: Number(row.days_overdue),
      agingBucket: String(row.aging_bucket),
    }));

    const totalBalance = mappedItems.reduce((s, i) => s + i.balanceDue, 0);

    return {
      items: mappedItems,
      totalBalance,
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
