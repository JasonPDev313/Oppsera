import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ArAgingCustomerRow {
  customerId: string;
  customerName: string | null;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface ArAgingReport {
  asOfDate: string;
  rows: ArAgingCustomerRow[];
  totals: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
  };
}

interface GetArAgingInput {
  tenantId: string;
  asOfDate?: string;
  customerId?: string;
}

export async function getArAging(input: GetArAgingInput): Promise<ArAgingReport> {
  const asOfDate = input.asOfDate ?? new Date().toISOString().split('T')[0]!;

  return withTenant(input.tenantId, async (tx) => {
    const customerFilter = input.customerId
      ? sql`AND i.customer_id = ${input.customerId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        i.customer_id,
        c.display_name AS customer_name,
        COALESCE(SUM(CASE WHEN ${asOfDate}::date - i.due_date <= 0 THEN i.balance_due::numeric ELSE 0 END), 0) AS current_amount,
        COALESCE(SUM(CASE WHEN ${asOfDate}::date - i.due_date BETWEEN 1 AND 30 THEN i.balance_due::numeric ELSE 0 END), 0) AS days_1_30,
        COALESCE(SUM(CASE WHEN ${asOfDate}::date - i.due_date BETWEEN 31 AND 60 THEN i.balance_due::numeric ELSE 0 END), 0) AS days_31_60,
        COALESCE(SUM(CASE WHEN ${asOfDate}::date - i.due_date BETWEEN 61 AND 90 THEN i.balance_due::numeric ELSE 0 END), 0) AS days_61_90,
        COALESCE(SUM(CASE WHEN ${asOfDate}::date - i.due_date > 90 THEN i.balance_due::numeric ELSE 0 END), 0) AS over_90,
        COALESCE(SUM(i.balance_due::numeric), 0) AS total
      FROM ar_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
      WHERE i.tenant_id = ${input.tenantId}
        AND i.status IN ('posted', 'partial')
        AND i.balance_due::numeric > 0
        ${customerFilter}
      GROUP BY i.customer_id, c.display_name
      HAVING SUM(i.balance_due::numeric) > 0
      ORDER BY SUM(i.balance_due::numeric) DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    const agingRows: ArAgingCustomerRow[] = arr.map((r) => ({
      customerId: String(r.customer_id),
      customerName: r.customer_name ? String(r.customer_name) : null,
      current: Number(r.current_amount ?? 0),
      days1to30: Number(r.days_1_30 ?? 0),
      days31to60: Number(r.days_31_60 ?? 0),
      days61to90: Number(r.days_61_90 ?? 0),
      over90: Number(r.over_90 ?? 0),
      total: Number(r.total ?? 0),
    }));

    const totals = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      total: 0,
    };

    for (const r of agingRows) {
      totals.current += r.current;
      totals.days1to30 += r.days1to30;
      totals.days31to60 += r.days31to60;
      totals.days61to90 += r.days61to90;
      totals.over90 += r.over90;
      totals.total += r.total;
    }

    // Round to avoid floating point noise
    totals.current = Math.round(totals.current * 10000) / 10000;
    totals.days1to30 = Math.round(totals.days1to30 * 10000) / 10000;
    totals.days31to60 = Math.round(totals.days31to60 * 10000) / 10000;
    totals.days61to90 = Math.round(totals.days61to90 * 10000) / 10000;
    totals.over90 = Math.round(totals.over90 * 10000) / 10000;
    totals.total = Math.round(totals.total * 10000) / 10000;

    return { asOfDate, rows: agingRows, totals };
  });
}
