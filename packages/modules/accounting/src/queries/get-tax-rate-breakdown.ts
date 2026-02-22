import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

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
  const api = getReconciliationReadApi();
  const apiRows = await api.getTaxBreakdown(input.tenantId, input.from, input.to, input.locationId);

  let totalTaxable = 0;
  let totalCollected = 0;

  const rates: TaxRateBreakdownRow[] = apiRows.map((r) => {
    totalTaxable += r.taxableSalesCents;
    totalCollected += r.taxCollectedCents;

    return {
      taxRateId: r.taxRateId,
      taxRateName: r.taxRateName,
      rateDecimal: r.rateDecimal,
      jurisdictionCode: r.jurisdictionCode,
      authorityName: r.authorityName,
      authorityType: r.authorityType,
      taxType: r.taxType,
      taxableSalesCents: r.taxableSalesCents,
      taxCollectedCents: r.taxCollectedCents,
      effectiveRate: r.taxableSalesCents > 0
        ? Math.round((r.taxCollectedCents / r.taxableSalesCents) * 10000) / 10000
        : 0,
      orderCount: r.orderCount,
    };
  });

  return {
    period: { from: input.from, to: input.to },
    rates,
    totalTaxableSalesCents: totalTaxable,
    totalTaxCollectedCents: totalCollected,
  };
}
