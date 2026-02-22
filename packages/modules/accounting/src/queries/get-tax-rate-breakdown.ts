import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TaxRateBreakdownRow {
  taxRateId: string | null;
  taxRateName: string;
  rateDecimal: number;
  jurisdictionCode: string | null;
  authorityName: string | null;
  authorityType: string | null;
  taxType: string;
  taxableSalesCents: number;
  taxCollectedCents: number;
  effectiveRate: number; // actual collected / taxable
  orderCount: number;
}

export interface TaxRateBreakdown {
  period: { from: string; to: string };
  rates: TaxRateBreakdownRow[];
  totalTaxableSalesCents: number;
  totalTaxCollectedCents: number;
}

interface GetTaxRateBreakdownInput {
  tenantId: string;
  from: string;
  to: string;
  locationId?: string;
}

/**
 * Per-rate tax summary for the period.
 * Groups by individual tax rate (not jurisdiction) for rate-level analysis.
 */
export async function getTaxRateBreakdown(
  input: GetTaxRateBreakdownInput,
): Promise<TaxRateBreakdown> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql` AND o.location_id = ${input.locationId}`
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

    let totalTaxable = 0;
    let totalCollected = 0;

    const rates: TaxRateBreakdownRow[] = arr.map((r) => {
      const taxable = Number(r.taxable_sales_cents);
      const collected = Number(r.tax_collected_cents);
      totalTaxable += taxable;
      totalCollected += collected;

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

    return {
      period: { from: input.from, to: input.to },
      rates,
      totalTaxableSalesCents: totalTaxable,
      totalTaxCollectedCents: totalCollected,
    };
  });
}
