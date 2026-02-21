import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetCheckSummaryInput } from '../validation';

export interface CheckSummaryItem {
  orderId: string;
  subtotalCents: number;
  taxTotalCents: number;
  serviceChargeTotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  tenderCount: number;
  status: string;
}

export async function getCheckSummary(
  input: GetCheckSummaryInput,
): Promise<CheckSummaryItem | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch order totals
    const orders = await tx.execute(
      sql`SELECT id, subtotal, tax_total, service_charge_total,
                 discount_total, total, status
          FROM orders
          WHERE id = ${input.orderId} AND tenant_id = ${input.tenantId}`,
    );

    const orderRows = Array.from(orders as Iterable<Record<string, unknown>>);
    if (orderRows.length === 0) return null;

    const o = orderRows[0]!;

    // Fetch tender sum
    const tenderResult = await tx.execute(
      sql`SELECT COALESCE(SUM(amount), 0) AS paid, COUNT(*) AS tender_count
          FROM tenders
          WHERE order_id = ${input.orderId} AND tenant_id = ${input.tenantId}
            AND status = 'captured'`,
    );

    const tenderRows = Array.from(tenderResult as Iterable<Record<string, unknown>>);
    const paid = Number(tenderRows[0]?.paid ?? 0);
    const tenderCount = Number(tenderRows[0]?.tender_count ?? 0);
    const total = Number(o.total);

    return {
      orderId: o.id as string,
      subtotalCents: Number(o.subtotal),
      taxTotalCents: Number(o.tax_total),
      serviceChargeTotalCents: Number(o.service_charge_total),
      discountTotalCents: Number(o.discount_total),
      totalCents: total,
      paidCents: paid,
      remainingCents: Math.max(0, total - paid),
      tenderCount,
      status: o.status as string,
    };
  });
}
