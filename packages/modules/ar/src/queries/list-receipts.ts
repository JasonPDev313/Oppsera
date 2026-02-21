import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ReceiptListItem {
  id: string;
  customerId: string;
  customerName: string | null;
  receiptDate: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  amount: number;
  status: string;
  sourceType: string;
  createdAt: string;
}

interface ListReceiptsInput {
  tenantId: string;
  customerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface ListReceiptsResult {
  items: ReceiptListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listReceipts(input: ListReceiptsInput): Promise<ListReceiptsResult> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [sql`r.tenant_id = ${input.tenantId}`];
    if (input.customerId) conditions.push(sql`r.customer_id = ${input.customerId}`);
    if (input.status) conditions.push(sql`r.status = ${input.status}`);
    if (input.startDate) conditions.push(sql`r.receipt_date >= ${input.startDate}`);
    if (input.endDate) conditions.push(sql`r.receipt_date <= ${input.endDate}`);
    if (input.cursor) conditions.push(sql`r.id < ${input.cursor}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        r.id, r.customer_id, c.display_name AS customer_name,
        r.receipt_date, r.payment_method, r.reference_number,
        r.amount, r.status, r.source_type, r.created_at
      FROM ar_receipts r
      LEFT JOIN customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
      WHERE ${whereClause}
      ORDER BY r.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        customerId: String(r.customer_id),
        customerName: r.customer_name ? String(r.customer_name) : null,
        receiptDate: String(r.receipt_date),
        paymentMethod: r.payment_method ? String(r.payment_method) : null,
        referenceNumber: r.reference_number ? String(r.reference_number) : null,
        amount: Number(r.amount),
        status: String(r.status),
        sourceType: String(r.source_type),
        createdAt: String(r.created_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
