import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type {
  OrdersSummaryData,
  TaxBreakdownRow,
  TaxRemittanceRow,
  CompTotalData,
} from '@oppsera/core/helpers/reconciliation-read-api';

// ── getOrdersSummary ────────────────────────────────────────────
/**
 * Aggregates gross sales, discounts, net sales, tax, service charges,
 * order count, void count, and void amount from the orders table.
 */
export async function getOrdersSummary(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<OrdersSummaryData> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql` AND location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'voided' THEN subtotal + tax_total + service_charge_total ELSE 0 END), 0)::integer AS gross_sales,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN discount_total ELSE 0 END), 0)::integer AS discount_total,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN total ELSE 0 END), 0)::integer AS net_sales,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN tax_total ELSE 0 END), 0)::integer AS tax,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN service_charge_total ELSE 0 END), 0)::integer AS service_charge,
        COUNT(CASE WHEN status != 'voided' THEN 1 END)::int AS order_count,
        COUNT(CASE WHEN status = 'voided' THEN 1 END)::int AS void_count,
        COALESCE(SUM(CASE WHEN status = 'voided' THEN total ELSE 0 END), 0)::integer AS void_amount
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${locationFilter}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const r = arr[0]!;

    return {
      grossSalesCents: Number(r.gross_sales),
      discountTotalCents: Number(r.discount_total),
      netSalesCents: Number(r.net_sales),
      taxCents: Number(r.tax),
      serviceChargeCents: Number(r.service_charge),
      orderCount: Number(r.order_count),
      voidCount: Number(r.void_count),
      voidAmountCents: Number(r.void_amount),
    };
  });
}

// ── getTaxBreakdown ─────────────────────────────────────────────
/**
 * Per-rate tax breakdown: aggregates order_line_taxes joined to
 * order_lines, orders, and tax_rates for rate-level analysis.
 */
export async function getTaxBreakdown(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<TaxBreakdownRow[]> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql` AND o.location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        olt.tax_rate_id,
        olt.tax_name AS tax_rate_name,
        olt.rate_decimal,
        tr.jurisdiction_code,
        tr.authority_name,
        tr.authority_type,
        COALESCE(tr.tax_type, 'sales') AS tax_type,
        COALESCE(SUM(ol.line_subtotal), 0)::bigint AS taxable_sales_cents,
        COALESCE(SUM(olt.amount), 0)::bigint AS tax_collected_cents,
        COUNT(DISTINCT o.id)::integer AS order_count
      FROM order_line_taxes olt
      JOIN order_lines ol ON ol.id = olt.order_line_id
        AND ol.tenant_id = ${tenantId}
      JOIN orders o ON o.id = ol.order_id
        AND o.tenant_id = ${tenantId}
        AND o.status NOT IN ('voided', 'open')
        AND o.business_date >= ${startDate}
        AND o.business_date <= ${endDate}
        ${locationFilter}
      LEFT JOIN tax_rates tr ON tr.id = olt.tax_rate_id
        AND tr.tenant_id = ${tenantId}
      WHERE olt.tenant_id = ${tenantId}
      GROUP BY
        olt.tax_rate_id,
        olt.tax_name,
        olt.rate_decimal,
        tr.jurisdiction_code,
        tr.authority_name,
        tr.authority_type,
        tr.tax_type
      ORDER BY
        COALESCE(SUM(olt.amount), 0) DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    return arr.map((r) => {
      const taxable = Number(r.taxable_sales_cents);
      const collected = Number(r.tax_collected_cents);

      return {
        taxRateId: r.tax_rate_id ? String(r.tax_rate_id) : null,
        taxRateName: String(r.tax_rate_name),
        rateDecimal: Number(r.rate_decimal),
        jurisdictionCode: r.jurisdiction_code ? String(r.jurisdiction_code) : null,
        authorityName: r.authority_name ? String(r.authority_name) : null,
        authorityType: r.authority_type ? String(r.authority_type) : null,
        taxType: String(r.tax_type),
        taxableSalesCents: taxable,
        taxCollectedCents: collected,
        effectiveRate: taxable > 0 ? Math.round((collected / taxable) * 10000) / 10000 : 0,
        orderCount: Number(r.order_count),
      };
    });
  });
}

// ── getTaxRemittanceData ────────────────────────────────────────
/**
 * Tax remittance data: per-jurisdiction/rate tax totals plus exempt
 * sales for filing purposes. Returns rows with exemptSalesCents
 * populated on each row (same value across all rows).
 */
export async function getTaxRemittanceData(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<TaxRemittanceRow[]> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql` AND o.location_id = ${locationId}`
      : sql``;

    // Tax data grouped by jurisdiction/rate
    const rows = await tx.execute(sql`
      SELECT
        tr.jurisdiction_code,
        tr.authority_name,
        tr.authority_type,
        COALESCE(tr.tax_type, 'sales') AS tax_type,
        tr.filing_frequency,
        olt.tax_rate_id,
        olt.tax_name AS tax_rate_name,
        olt.rate_decimal,
        COALESCE(SUM(ol.line_subtotal), 0)::bigint AS taxable_sales_cents,
        COALESCE(SUM(olt.amount), 0)::bigint AS tax_collected_cents,
        COUNT(DISTINCT o.id)::integer AS order_count
      FROM order_line_taxes olt
      JOIN order_lines ol ON ol.id = olt.order_line_id
        AND ol.tenant_id = ${tenantId}
      JOIN orders o ON o.id = ol.order_id
        AND o.tenant_id = ${tenantId}
        AND o.status NOT IN ('voided', 'open')
        AND o.business_date >= ${startDate}
        AND o.business_date <= ${endDate}
        ${locationFilter}
      LEFT JOIN tax_rates tr ON tr.id = olt.tax_rate_id
        AND tr.tenant_id = ${tenantId}
      WHERE olt.tenant_id = ${tenantId}
      GROUP BY
        tr.jurisdiction_code,
        tr.authority_name,
        tr.authority_type,
        tr.tax_type,
        tr.filing_frequency,
        olt.tax_rate_id,
        olt.tax_name,
        olt.rate_decimal
      ORDER BY
        tr.jurisdiction_code NULLS LAST,
        tr.authority_type NULLS LAST,
        tr.authority_name NULLS LAST,
        olt.tax_name
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    // Exempt sales total for the period
    const exemptRows = await tx.execute(sql`
      SELECT COALESCE(SUM(o.subtotal), 0)::bigint AS exempt_sales_cents
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.tax_exempt = true
        AND o.status NOT IN ('voided', 'open')
        AND o.business_date >= ${startDate}
        AND o.business_date <= ${endDate}
        ${locationFilter}
    `);

    const exemptArr = Array.from(exemptRows as Iterable<Record<string, unknown>>);
    const exemptSalesCents = Number(exemptArr[0]?.exempt_sales_cents ?? 0);

    return arr.map((r) => ({
      jurisdictionCode: r.jurisdiction_code ? String(r.jurisdiction_code) : null,
      authorityName: r.authority_name ? String(r.authority_name) : null,
      authorityType: r.authority_type ? String(r.authority_type) : null,
      taxType: String(r.tax_type),
      filingFrequency: r.filing_frequency ? String(r.filing_frequency) : null,
      taxRateId: r.tax_rate_id ? String(r.tax_rate_id) : null,
      taxRateName: String(r.tax_rate_name),
      rateDecimal: Number(r.rate_decimal),
      taxableSalesCents: Number(r.taxable_sales_cents),
      taxCollectedCents: Number(r.tax_collected_cents),
      exemptSalesCents,
      orderCount: Number(r.order_count),
    }));
  });
}

// ── getCompTotals ───────────────────────────────────────────────
/**
 * Aggregates comp_events for the date range and optional location.
 */
export async function getCompTotals(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<CompTotalData> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql` AND location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount_cents), 0)::integer AS total_comps
      FROM comp_events
      WHERE tenant_id = ${tenantId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${locationFilter}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const totalComps = arr.length > 0 ? Number(arr[0]!.total_comps) : 0;

    return {
      totalCompsCents: totalComps,
    };
  });
}

// ── getOrderAuditCount ──────────────────────────────────────────
/**
 * Counts orders in placed/paid/voided status within the date range
 * for audit coverage comparison.
 */
export async function getOrderAuditCount(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND status IN ('placed', 'paid', 'voided')
        AND created_at >= ${startDate}::timestamptz
        AND created_at < (${endDate}::date + interval '1 day')::timestamptz
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.length > 0 ? Number(arr[0]!.count) : 0;
  });
}
