import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/** Encode a composite cursor as base64url "dueDate|id". */
function encodeCursor(dueDate: string, id: string): string {
  return Buffer.from(`${dueDate}|${id}`).toString('base64url');
}

/** Decode a composite cursor. Returns null for legacy plain-id cursors. */
function decodeCursor(cursor: string): { dueDate: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const pipe = decoded.indexOf('|');
    if (pipe === -1) return null; // legacy id-only cursor
    const dueDate = decoded.slice(0, pipe);
    const id = decoded.slice(pipe + 1);
    if (!dueDate || !id) return null;
    return { dueDate, id };
  } catch {
    return null;
  }
}

export interface OpenInvoiceItem {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  daysOverdue: number;
}

interface GetOpenInvoicesInput {
  tenantId: string;
  customerId?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
}

export interface GetOpenInvoicesResult {
  items: OpenInvoiceItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getOpenInvoices(input: GetOpenInvoicesInput): Promise<GetOpenInvoicesResult> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`i.tenant_id = ${input.tenantId}`,
      sql`i.status IN ('posted', 'partial')`,
      sql`i.balance_due::numeric > 0`,
    ];

    if (input.customerId) conditions.push(sql`i.customer_id = ${input.customerId}`);
    if (input.overdue) conditions.push(sql`i.due_date < CURRENT_DATE`);
    if (input.cursor) {
      const parsed = decodeCursor(input.cursor);
      if (parsed) {
        // Composite cursor: ORDER BY due_date ASC, id DESC (mixed directions — use OR expansion)
        conditions.push(sql`(i.due_date > ${parsed.dueDate} OR (i.due_date = ${parsed.dueDate} AND i.id < ${parsed.id}))`);
      } else {
        // Legacy plain-id cursor fallback
        conditions.push(sql`i.id < ${input.cursor}`);
      }
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        i.id, i.customer_id, c.display_name AS customer_name,
        i.invoice_number, i.invoice_date, i.due_date,
        i.total_amount, i.amount_paid, i.balance_due, i.status,
        GREATEST(0, CURRENT_DATE - i.due_date) AS days_overdue
      FROM ar_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
      WHERE ${whereClause}
      ORDER BY i.due_date ASC, i.id DESC
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
        totalAmount: Number(r.total_amount),
        amountPaid: Number(r.amount_paid),
        balanceDue: Number(r.balance_due),
        status: String(r.status),
        daysOverdue: Number(r.days_overdue ?? 0),
      })),
      cursor: hasMore && items[items.length - 1]
        ? encodeCursor(String(items[items.length - 1]!.due_date), String(items[items.length - 1]!.id))
        : null,
      hasMore,
    };
  });
}
