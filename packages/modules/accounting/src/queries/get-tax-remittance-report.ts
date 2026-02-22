import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

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
 */
export async function getTaxRemittanceReport(
  input: GetTaxRemittanceReportInput,
): Promise<TaxRemittanceReport> {
  const api = getReconciliationReadApi();
  const rows = await api.getTaxRemittanceData(input.tenantId, input.from, input.to, input.locationId);

  let totalTaxable = 0;
  let totalCollected = 0;
  let totalExempt = 0;

  const remittanceRows: TaxRemittanceRow[] = rows.map((r) => {
    totalTaxable += r.taxableSalesCents;
    totalCollected += r.taxCollectedCents;
    totalExempt += r.exemptSalesCents;

    return {
      jurisdictionCode: r.jurisdictionCode,
      authorityName: r.authorityName,
      authorityType: r.authorityType,
      taxType: r.taxType,
      filingFrequency: r.filingFrequency,
      taxRateId: r.taxRateId,
      taxRateName: r.taxRateName,
      rateDecimal: r.rateDecimal,
      taxableSalesCents: r.taxableSalesCents,
      taxCollectedCents: r.taxCollectedCents,
      exemptSalesCents: r.exemptSalesCents,
      orderCount: r.orderCount,
    };
  });

  return {
    period: { from: input.from, to: input.to },
    locationId: input.locationId ?? null,
    rows: remittanceRows,
    totalTaxableSalesCents: totalTaxable,
    totalTaxCollectedCents: totalCollected,
    totalExemptSalesCents: totalExempt,
  };
}
