import { withTenant, sql } from '@oppsera/db';

export interface TaxReconciliationRow {
  orderId: string;
  orderNumber: string;
  businessDate: string;
  locationId: string;
  status: string;
  orderTaxTotal: number;
  lineTaxSum: number;
  breakdownTaxSum: number;
  discountTotal: number;
  driftCents: number;
  breakdownDriftCents: number;
}

export interface TaxReconciliationAudit {
  period: { from: string; to: string };
  locationId: string | null;
  totalOrders: number;
  driftedOrders: number;
  rows: TaxReconciliationRow[];
  totalDriftCents: number;
}

interface GetTaxReconciliationAuditInput {
  tenantId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  locationId?: string;
}

/**
 * Tax reconciliation audit: flags orders where orders.tax_total
 * does not match the sum of order_lines.line_tax or the sum of
 * order_line_taxes.amount. This catches drift from:
 *   - Discount tax adjustments not propagating
 *   - Manual edits
 *   - Bug-introduced mismatches
 *
 * Only returns orders with non-zero drift.
 */
export async function getTaxReconciliationAudit(
  input: GetTaxReconciliationAuditInput,
): Promise<TaxReconciliationAudit> {
  const rows = await withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql` AND o.location_id = ${input.locationId}`
      : sql``;

    const result = await tx.execute(sql`
      WITH line_tax_sums AS (
        SELECT
          ol.order_id,
          SUM(ol.line_tax) AS line_tax_sum,
          COALESCE(SUM(olt.amount), 0) AS breakdown_tax_sum
        FROM order_lines ol
        LEFT JOIN order_line_taxes olt
          ON olt.order_line_id = ol.id
          AND olt.tenant_id = ol.tenant_id
        WHERE ol.tenant_id = ${input.tenantId}
        GROUP BY ol.order_id
      )
      SELECT
        o.id AS order_id,
        o.order_number,
        o.business_date,
        o.location_id,
        o.status,
        o.tax_total AS order_tax_total,
        COALESCE(lts.line_tax_sum, 0)::int AS line_tax_sum,
        COALESCE(lts.breakdown_tax_sum, 0)::int AS breakdown_tax_sum,
        o.discount_total,
        (o.tax_total - COALESCE(lts.line_tax_sum, 0))::int AS drift_cents,
        (COALESCE(lts.line_tax_sum, 0) - COALESCE(lts.breakdown_tax_sum, 0))::int AS breakdown_drift_cents
      FROM orders o
      LEFT JOIN line_tax_sums lts ON lts.order_id = o.id
      WHERE o.tenant_id = ${input.tenantId}
        AND o.business_date >= ${input.from}
        AND o.business_date <= ${input.to}
        AND o.status IN ('paid', 'open')
        ${locationFilter}
        AND (
          o.tax_total != COALESCE(lts.line_tax_sum, 0)
          OR COALESCE(lts.line_tax_sum, 0) != COALESCE(lts.breakdown_tax_sum, 0)
        )
      ORDER BY ABS(o.tax_total - COALESCE(lts.line_tax_sum, 0)) DESC
      LIMIT 500
    `);

    return Array.from(result as Iterable<Record<string, unknown>>);
  });

  const mapped: TaxReconciliationRow[] = rows.map((r) => ({
    orderId: r.order_id as string,
    orderNumber: r.order_number as string,
    businessDate: r.business_date as string,
    locationId: r.location_id as string,
    status: r.status as string,
    orderTaxTotal: Number(r.order_tax_total),
    lineTaxSum: Number(r.line_tax_sum),
    breakdownTaxSum: Number(r.breakdown_tax_sum),
    discountTotal: Number(r.discount_total),
    driftCents: Number(r.drift_cents),
    breakdownDriftCents: Number(r.breakdown_drift_cents),
  }));

  const totalDrift = mapped.reduce((sum, r) => sum + Math.abs(r.driftCents), 0);

  return {
    period: { from: input.from, to: input.to },
    locationId: input.locationId ?? null,
    totalOrders: mapped.length,
    driftedOrders: mapped.filter((r) => r.driftCents !== 0).length,
    rows: mapped,
    totalDriftCents: totalDrift,
  };
}
