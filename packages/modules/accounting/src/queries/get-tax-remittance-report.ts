import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TaxRemittanceRow {
  jurisdictionCode: string | null;
  authorityName: string | null;
  authorityType: string | null;
  taxType: string;
  filingFrequency: string | null;
  taxRateId: string | null;
  taxRateName: string;
  rateDecimal: number;
  taxableSalesCents: number;
  taxCollectedCents: number;
  exemptSalesCents: number;
  orderCount: number;
}

export interface TaxRemittanceReport {
  period: { from: string; to: string };
  locationId: string | null;
  rows: TaxRemittanceRow[];
  totalTaxableSalesCents: number;
  totalTaxCollectedCents: number;
  totalExemptSalesCents: number;
}

interface GetTaxRemittanceReportInput {
  tenantId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  locationId?: string;
}

/**
 * Tax remittance report: aggregates order_line_taxes → tax_rates
 * grouped by jurisdiction/authority/rate for filing purposes.
 *
 * Uses order_line_taxes (transactional data) rather than GL entries
 * to provide per-rate, per-jurisdiction detail needed for filing.
 */
export async function getTaxRemittanceReport(
  input: GetTaxRemittanceReportInput,
): Promise<TaxRemittanceReport> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql` AND o.location_id = ${input.locationId}`
      : sql``;

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
        AND ol.tenant_id = ${input.tenantId}
      JOIN orders o ON o.id = ol.order_id
        AND o.tenant_id = ${input.tenantId}
        AND o.status NOT IN ('voided', 'open')
        AND o.business_date >= ${input.from}
        AND o.business_date <= ${input.to}
        ${locationFilter}
      LEFT JOIN tax_rates tr ON tr.id = olt.tax_rate_id
        AND tr.tenant_id = ${input.tenantId}
      WHERE olt.tenant_id = ${input.tenantId}
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

    let totalTaxable = 0;
    let totalCollected = 0;

    const remittanceRows: TaxRemittanceRow[] = arr.map((r) => {
      const taxable = Number(r.taxable_sales_cents);
      const collected = Number(r.tax_collected_cents);
      totalTaxable += taxable;
      totalCollected += collected;

      return {
        jurisdictionCode: r.jurisdiction_code ? String(r.jurisdiction_code) : null,
        authorityName: r.authority_name ? String(r.authority_name) : null,
        authorityType: r.authority_type ? String(r.authority_type) : null,
        taxType: String(r.tax_type),
        filingFrequency: r.filing_frequency ? String(r.filing_frequency) : null,
        taxRateId: r.tax_rate_id ? String(r.tax_rate_id) : null,
        taxRateName: String(r.tax_rate_name),
        rateDecimal: Number(r.rate_decimal),
        taxableSalesCents: taxable,
        taxCollectedCents: collected,
        exemptSalesCents: 0, // Populated separately below
        orderCount: Number(r.order_count),
      };
    });

    // Get tax-exempt sales total for the period
    const exemptRows = await tx.execute(sql`
      SELECT COALESCE(SUM(o.subtotal), 0)::bigint AS exempt_sales_cents
      FROM orders o
      WHERE o.tenant_id = ${input.tenantId}
        AND o.tax_exempt = true
        AND o.status NOT IN ('voided', 'open')
        AND o.business_date >= ${input.from}
        AND o.business_date <= ${input.to}
        ${locationFilter}
    `);

    const exemptArr = Array.from(exemptRows as Iterable<Record<string, unknown>>);
    const totalExempt = Number(exemptArr[0]?.exempt_sales_cents ?? 0);

    return {
      period: { from: input.from, to: input.to },
      locationId: input.locationId ?? null,
      rows: remittanceRows,
      totalTaxableSalesCents: totalTaxable,
      totalTaxCollectedCents: totalCollected,
      totalExemptSalesCents: totalExempt,
    };
  });
}
