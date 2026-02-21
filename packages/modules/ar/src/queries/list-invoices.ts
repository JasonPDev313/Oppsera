import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface InvoiceListItem {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  sourceType: string;
  createdAt: string;
}

interface ListInvoicesInput {
  tenantId: string;
  status?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface ListInvoicesResult {
  items: InvoiceListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listInvoices(input: ListInvoicesInput): Promise<ListInvoicesResult> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [sql`i.tenant_id = ${input.tenantId}`];
    if (input.status) conditions.push(sql`i.status = ${input.status}`);
    if (input.customerId) conditions.push(sql`i.customer_id = ${input.customerId}`);
    if (input.startDate) conditions.push(sql`i.invoice_date >= ${input.startDate}`);
    if (input.endDate) conditions.push(sql`i.invoice_date <= ${input.endDate}`);
    if (input.cursor) conditions.push(sql`i.id < ${input.cursor}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        i.id, i.customer_id, c.display_name AS customer_name,
        i.invoice_number, i.invoice_date, i.due_date, i.status,
        i.total_amount, i.amount_paid, i.balance_due, i.source_type, i.created_at
      FROM ar_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
      WHERE ${whereClause}
      ORDER BY i.id DESC
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
        invoiceNumber: String(r.invoice_number),
        invoiceDate: String(r.invoice_date),
        dueDate: String(r.due_date),
        status: String(r.status),
        totalAmount: Number(r.total_amount),
        amountPaid: Number(r.amount_paid),
        balanceDue: Number(r.balance_due),
        sourceType: String(r.source_type),
        createdAt: String(r.created_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
