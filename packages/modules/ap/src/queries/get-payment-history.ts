import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/** Encode a composite cursor as base64url "paymentDate|id". */
function encodeCursor(paymentDate: string, id: string): string {
  return Buffer.from(`${paymentDate}|${id}`).toString('base64url');
}

/** Decode a composite cursor. Returns null for legacy plain-id cursors. */
function decodeCursor(cursor: string): { paymentDate: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const pipe = decoded.indexOf('|');
    if (pipe === -1) return null; // legacy id-only cursor
    const paymentDate = decoded.slice(0, pipe);
    const id = decoded.slice(pipe + 1);
    if (!paymentDate || !id) return null;
    return { paymentDate, id };
  } catch {
    return null;
  }
}

export interface GetPaymentHistoryInput {
  tenantId: string;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface PaymentHistoryItem {
  id: string;
  vendorId: string;
  vendorName: string;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  amount: number;
  status: string;
  allocations: Array<{
    billId: string;
    billNumber: string;
    amountApplied: number;
  }>;
  createdAt: string;
}

export interface GetPaymentHistoryResult {
  items: PaymentHistoryItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getPaymentHistory(input: GetPaymentHistoryInput): Promise<GetPaymentHistoryResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.tenant_id = ${input.tenantId}`,
    ];
    if (input.vendorId) conditions.push(sql`p.vendor_id = ${input.vendorId}`);
    if (input.startDate) conditions.push(sql`p.payment_date >= ${input.startDate}`);
    if (input.endDate) conditions.push(sql`p.payment_date <= ${input.endDate}`);
    if (input.paymentMethod) conditions.push(sql`p.payment_method = ${input.paymentMethod}`);
    if (input.status) conditions.push(sql`p.status = ${input.status}`);
    if (input.cursor) {
      const parsed = decodeCursor(input.cursor);
      if (parsed) {
        // Both DESC — use row-value comparison: (payment_date, id) < (cursorDate, cursorId)
        conditions.push(sql`(p.payment_date, p.id) < (${parsed.paymentDate}::date, ${parsed.id})`);
      } else {
        // Legacy plain-id cursor fallback
        conditions.push(sql`p.id < ${input.cursor}`);
      }
    }

    const whereClause = conditions.reduce(
      (acc, cond, i) => (i === 0 ? sql`WHERE ${cond}` : sql`${acc} AND ${cond}`),
      sql``,
    );

    // Get payments
    const paymentRows = await tx.execute(sql`
      SELECT
        p.id,
        p.vendor_id,
        v.name AS vendor_name,
        p.payment_date,
        p.payment_method,
        p.reference_number,
        p.amount,
        p.status,
        p.created_at
      FROM ap_payments p
      INNER JOIN vendors v ON v.id = p.vendor_id
      ${whereClause}
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(paymentRows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const paymentItems = hasMore ? allRows.slice(0, limit) : allRows;

    // Get allocations for each payment
    const items: PaymentHistoryItem[] = [];

    for (const p of paymentItems) {
      const pid = String(p.id);
      const allocRows = await tx.execute(sql`
        SELECT pa.bill_id, b.bill_number, pa.amount_applied
        FROM ap_payment_allocations pa
        INNER JOIN ap_bills b ON b.id = pa.bill_id
        WHERE pa.payment_id = ${pid}
      `);

      const allocations = Array.from(allocRows as Iterable<Record<string, unknown>>).map((a) => ({
        billId: String(a.bill_id),
        billNumber: String(a.bill_number),
        amountApplied: Number(a.amount_applied),
      }));

      items.push({
        id: pid,
        vendorId: String(p.vendor_id),
        vendorName: String(p.vendor_name),
        paymentDate: String(p.payment_date),
        paymentMethod: p.payment_method ? String(p.payment_method) : null,
        referenceNumber: p.reference_number ? String(p.reference_number) : null,
        amount: Number(p.amount),
        status: String(p.status),
        allocations,
        createdAt: String(p.created_at),
      });
    }

    const lastPayment = paymentItems[paymentItems.length - 1];
    return {
      items,
      cursor: hasMore && lastPayment
        ? encodeCursor(String(lastPayment.payment_date), String(lastPayment.id))
        : null,
      hasMore,
    };
  });
}
