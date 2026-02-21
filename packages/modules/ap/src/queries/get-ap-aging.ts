import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetApAgingInput {
  tenantId: string;
  asOfDate?: string; // defaults to today
  vendorId?: string;
}

export interface ApAgingVendorRow {
  vendorId: string;
  vendorName: string;
  current: number;    // not yet due
  days1to30: number;  // 1-30 days past due
  days31to60: number; // 31-60 days past due
  days61to90: number; // 61-90 days past due
  days90plus: number; // 90+ days past due
  total: number;
}

export interface ApAgingReport {
  asOfDate: string;
  vendors: ApAgingVendorRow[];
  totals: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
  };
}

export async function getApAging(input: GetApAgingInput): Promise<ApAgingReport> {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);

  return withTenant(input.tenantId, async (tx) => {
    const vendorFilter = input.vendorId
      ? sql`AND b.vendor_id = ${input.vendorId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COALESCE(SUM(
          CASE WHEN b.due_date >= ${asOfDate}::date THEN
            b.total_amount - COALESCE(paid.paid_amount, 0)
          ELSE 0 END
        ), 0) AS current_bucket,
        COALESCE(SUM(
          CASE WHEN b.due_date < ${asOfDate}::date
            AND b.due_date >= (${asOfDate}::date - INTERVAL '30 days') THEN
            b.total_amount - COALESCE(paid.paid_amount, 0)
          ELSE 0 END
        ), 0) AS days_1_to_30,
        COALESCE(SUM(
          CASE WHEN b.due_date < (${asOfDate}::date - INTERVAL '30 days')
            AND b.due_date >= (${asOfDate}::date - INTERVAL '60 days') THEN
            b.total_amount - COALESCE(paid.paid_amount, 0)
          ELSE 0 END
        ), 0) AS days_31_to_60,
        COALESCE(SUM(
          CASE WHEN b.due_date < (${asOfDate}::date - INTERVAL '60 days')
            AND b.due_date >= (${asOfDate}::date - INTERVAL '90 days') THEN
            b.total_amount - COALESCE(paid.paid_amount, 0)
          ELSE 0 END
        ), 0) AS days_61_to_90,
        COALESCE(SUM(
          CASE WHEN b.due_date < (${asOfDate}::date - INTERVAL '90 days') THEN
            b.total_amount - COALESCE(paid.paid_amount, 0)
          ELSE 0 END
        ), 0) AS days_90_plus,
        COALESCE(SUM(
          b.total_amount - COALESCE(paid.paid_amount, 0)
        ), 0) AS total
      FROM ap_bills b
      INNER JOIN vendors v ON v.id = b.vendor_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pa.amount), 0) AS paid_amount
        FROM ap_payment_allocations pa
        INNER JOIN ap_payments p ON p.id = pa.payment_id
        WHERE pa.bill_id = b.id
          AND p.status != 'voided'
          AND p.payment_date <= ${asOfDate}::date
      ) paid ON true
      WHERE b.tenant_id = ${input.tenantId}
        AND b.status IN ('posted', 'partial')
        AND (b.total_amount - COALESCE(paid.paid_amount, 0)) > 0
        ${vendorFilter}
      GROUP BY v.id, v.name
      HAVING SUM(b.total_amount - COALESCE(paid.paid_amount, 0)) > 0
      ORDER BY v.name
    `);

    const vendors = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      vendorId: String(row.vendor_id),
      vendorName: String(row.vendor_name),
      current: Number(row.current_bucket),
      days1to30: Number(row.days_1_to_30),
      days31to60: Number(row.days_31_to_60),
      days61to90: Number(row.days_61_to_90),
      days90plus: Number(row.days_90_plus),
      total: Number(row.total),
    }));

    // Compute totals
    const totals = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
      total: 0,
    };

    for (const v of vendors) {
      totals.current += v.current;
      totals.days1to30 += v.days1to30;
      totals.days31to60 += v.days31to60;
      totals.days61to90 += v.days61to90;
      totals.days90plus += v.days90plus;
      totals.total += v.total;
    }

    // Round to avoid floating point noise
    totals.current = Math.round(totals.current * 10000) / 10000;
    totals.days1to30 = Math.round(totals.days1to30 * 10000) / 10000;
    totals.days31to60 = Math.round(totals.days31to60 * 10000) / 10000;
    totals.days61to90 = Math.round(totals.days61to90 * 10000) / 10000;
    totals.days90plus = Math.round(totals.days90plus * 10000) / 10000;
    totals.total = Math.round(totals.total * 10000) / 10000;

    return {
      asOfDate,
      vendors,
      totals,
    };
  });
}
