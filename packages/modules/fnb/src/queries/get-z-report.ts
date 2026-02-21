import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetZReportInput } from '../validation';

export interface ZReportData {
  closeBatchId: string;
  grossSalesCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  tipsCreditCents: number;
  tipsCashDeclaredCents: number;
  serviceChargesCents: number;
  discountsCents: number;
  compsCents: number;
  voidsCents: number;
  voidsCount: number;
  discountsCount: number;
  compsCount: number;
  coversCount: number;
  avgCheckCents: number;
  tenderBreakdown: unknown[];
  salesByDepartment: unknown[] | null;
  taxByGroup: unknown[] | null;
  cashStartingFloatCents: number;
  cashSalesCents: number;
  cashTipsCents: number;
  cashDropsCents: number;
  cashPaidOutsCents: number;
  cashExpectedCents: number;
  cashCountedCents: number | null;
  cashOverShortCents: number | null;
}

export async function getZReport(
  input: GetZReportInput,
): Promise<ZReportData | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT s.close_batch_id,
                 s.gross_sales_cents, s.net_sales_cents, s.tax_collected_cents,
                 s.tips_credit_cents, s.tips_cash_declared_cents, s.service_charges_cents,
                 s.discounts_cents, s.comps_cents, s.voids_cents,
                 s.voids_count, s.discounts_count, s.comps_count,
                 s.covers_count, s.avg_check_cents,
                 s.tender_breakdown, s.sales_by_department, s.tax_by_group,
                 s.cash_starting_float_cents, s.cash_sales_cents, s.cash_tips_cents,
                 s.cash_drops_cents, s.cash_paid_outs_cents, s.cash_expected_cents,
                 s.cash_counted_cents, s.cash_over_short_cents
          FROM fnb_close_batch_summaries s
          JOIN fnb_close_batches b ON b.id = s.close_batch_id
          WHERE s.close_batch_id = ${input.closeBatchId}
            AND b.tenant_id = ${input.tenantId}`,
    );
    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      closeBatchId: r.close_batch_id as string,
      grossSalesCents: Number(r.gross_sales_cents),
      netSalesCents: Number(r.net_sales_cents),
      taxCollectedCents: Number(r.tax_collected_cents),
      tipsCreditCents: Number(r.tips_credit_cents),
      tipsCashDeclaredCents: Number(r.tips_cash_declared_cents),
      serviceChargesCents: Number(r.service_charges_cents),
      discountsCents: Number(r.discounts_cents),
      compsCents: Number(r.comps_cents),
      voidsCents: Number(r.voids_cents),
      voidsCount: Number(r.voids_count),
      discountsCount: Number(r.discounts_count),
      compsCount: Number(r.comps_count),
      coversCount: Number(r.covers_count),
      avgCheckCents: Number(r.avg_check_cents),
      tenderBreakdown: r.tender_breakdown as unknown[],
      salesByDepartment: (r.sales_by_department as unknown[]) ?? null,
      taxByGroup: (r.tax_by_group as unknown[]) ?? null,
      cashStartingFloatCents: Number(r.cash_starting_float_cents),
      cashSalesCents: Number(r.cash_sales_cents),
      cashTipsCents: Number(r.cash_tips_cents),
      cashDropsCents: Number(r.cash_drops_cents),
      cashPaidOutsCents: Number(r.cash_paid_outs_cents),
      cashExpectedCents: Number(r.cash_expected_cents),
      cashCountedCents: r.cash_counted_cents != null ? Number(r.cash_counted_cents) : null,
      cashOverShortCents: r.cash_over_short_cents != null ? Number(r.cash_over_short_cents) : null,
    };
  });
}
