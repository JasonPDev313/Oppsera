import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface DailyReconciliation {
  businessDate: string;
  locationId: string;
  sales: {
    grossSalesCents: number;
    discountsCents: number;
    netSalesCents: number;
    taxCents: number;
    serviceChargeCents: number;
    tipsCents: number;
    totalCents: number;
    orderCount: number;
    voidCount: number;
    voidAmountCents: number;
  };
  tenders: {
    cashCents: number;
    cardCents: number;
    otherCents: number;
    totalCents: number;
    tenderCount: number;
  };
  gl: {
    revenueDebitsCents: number;
    revenueCreditsCents: number;
    totalDebitsDollars: string;
    totalCreditsDollars: string;
    isBalanced: boolean;
  };
  reconciliation: {
    salesVsTendersDiffCents: number;
    status: 'balanced' | 'difference';
  };
}

/**
 * Daily reconciliation: Sales vs Tenders vs GL for a location on a business date.
 * Three-column comparison showing the full accounting picture.
 */
export async function getDailyReconciliation(input: {
  tenantId: string;
  locationId: string;
  businessDate: string;
}): Promise<DailyReconciliation> {
  const api = getReconciliationReadApi();

  // Parallel: orders summary + tenders summary (API) + GL (local)
  const [ordersSummary, tendersSummary, glData] = await Promise.all([
    api.getOrdersSummary(input.tenantId, input.businessDate, input.businessDate, input.locationId),
    api.getTendersSummary(input.tenantId, input.businessDate, input.businessDate, input.locationId),
    withTenant(input.tenantId, async (tx) => {
      const glRows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(jl.debit_amount), 0) AS total_debits,
          COALESCE(SUM(jl.credit_amount), 0) AS total_credits
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.business_date = ${input.businessDate}
          AND je.status = 'posted'
          AND jl.location_id = ${input.locationId}
      `);
      const glArr = Array.from(glRows as Iterable<Record<string, unknown>>);
      const gl = glArr[0]!;
      return {
        totalDebits: Number(gl.total_debits),
        totalCredits: Number(gl.total_credits),
      };
    }),
  ]);

  const netSalesCents = ordersSummary.netSalesCents;
  const totalTenderCents = tendersSummary.totalCents;
  const diffCents = Math.abs(netSalesCents - totalTenderCents);

  return {
    businessDate: input.businessDate,
    locationId: input.locationId,
    sales: {
      grossSalesCents: ordersSummary.grossSalesCents,
      discountsCents: ordersSummary.discountTotalCents,
      netSalesCents,
      taxCents: ordersSummary.taxCents,
      serviceChargeCents: ordersSummary.serviceChargeCents,
      tipsCents: tendersSummary.tipsCents,
      totalCents: netSalesCents + tendersSummary.tipsCents,
      orderCount: ordersSummary.orderCount,
      voidCount: ordersSummary.voidCount,
      voidAmountCents: ordersSummary.voidAmountCents,
    },
    tenders: {
      cashCents: tendersSummary.cashCents,
      cardCents: tendersSummary.cardCents,
      otherCents: tendersSummary.otherCents,
      totalCents: totalTenderCents,
      tenderCount: tendersSummary.tenderCount,
    },
    gl: {
      revenueDebitsCents: Math.round(glData.totalDebits * 100),
      revenueCreditsCents: Math.round(glData.totalCredits * 100),
      totalDebitsDollars: glData.totalDebits.toFixed(2),
      totalCreditsDollars: glData.totalCredits.toFixed(2),
      isBalanced: Math.abs(glData.totalDebits - glData.totalCredits) < 0.01,
    },
    reconciliation: {
      salesVsTendersDiffCents: diffCents,
      status: diffCents < 1 ? 'balanced' : 'difference',
    },
  };
}
