import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface WaterfallStage {
  stage: string;
  label: string;
  amount: number;      // cents
  expected: number | null;  // cents — null means no expected value
  variance: number | null;  // cents — null means no comparison
  indent: number;       // 0 = top-level, 1 = sub-item
  drillType: string | null; // entity type for drill-down
}

export interface ReconciliationWaterfall {
  businessDate: string;
  locationId: string | null;
  stages: WaterfallStage[];
  totalVariance: number;
  isBalanced: boolean;
}

interface WaterfallInput {
  tenantId: string;
  businessDate: string;
  locationId?: string;
}

export async function getReconciliationWaterfall(
  input: WaterfallInput,
): Promise<ReconciliationWaterfall> {
  const api = getReconciliationReadApi();

  // Parallel: orders + tenders + over/short (API) + settlements/deposits (local)
  const [ordersSummary, tendersSummary, overShort, localData] = await Promise.all([
    api.getOrdersSummary(input.tenantId, input.businessDate, input.businessDate, input.locationId),
    api.getTendersSummary(input.tenantId, input.businessDate, input.businessDate, input.locationId),
    api.getOverShortTotal(input.tenantId, input.businessDate, input.businessDate, input.locationId),
    withTenant(input.tenantId, async (tx) => {
      // Card settlements (need dollar amounts — API only returns counts)
      const settlementRows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(gross_amount::numeric * 100), 0)::bigint AS gross_settlements,
          COALESCE(SUM(fee_amount::numeric * 100), 0)::bigint AS total_fees,
          COALESCE(SUM(net_amount::numeric * 100), 0)::bigint AS net_settlements,
          COALESCE(SUM(chargeback_amount::numeric * 100), 0)::bigint AS total_chargebacks
        FROM payment_settlements
        WHERE tenant_id = ${input.tenantId}
          AND (
            business_date_from <= ${input.businessDate}
            AND business_date_to >= ${input.businessDate}
          )
          AND status IN ('matched', 'posted')
          ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
      `);
      const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);

      // Cash deposits (need dollar amounts — API only returns counts)
      const depositRows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(total_amount_cents), 0)::bigint AS cash_deposits
        FROM deposit_slips
        WHERE tenant_id = ${input.tenantId}
          AND business_date = ${input.businessDate}
          AND status IN ('deposited', 'reconciled')
          ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
      `);
      const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);

      return {
        grossSettlements: Number(settlementArr[0]?.gross_settlements ?? 0),
        totalFees: Number(settlementArr[0]?.total_fees ?? 0),
        netSettlements: Number(settlementArr[0]?.net_settlements ?? 0),
        cashDeposits: Number(depositArr[0]?.cash_deposits ?? 0),
      };
    }),
  ]);

  const stages: WaterfallStage[] = [];

  // 1. Orders Total (from API)
  const grossSales = ordersSummary.grossSalesCents;
  const discountTotal = ordersSummary.discountTotalCents;
  const taxTotal = ordersSummary.taxCents;
  const serviceChargeTotal = ordersSummary.serviceChargeCents;
  const netSales = grossSales - discountTotal;

  stages.push({
    stage: 'orders_total', label: 'Orders Total (Gross Sales)',
    amount: grossSales, expected: null, variance: null, indent: 0, drillType: 'orders',
  });

  stages.push({
    stage: 'discounts', label: 'Discounts',
    amount: -discountTotal, expected: null, variance: null, indent: 1, drillType: null,
  });

  stages.push({
    stage: 'net_sales', label: 'Net Sales',
    amount: netSales, expected: null, variance: null, indent: 0, drillType: null,
  });

  stages.push({
    stage: 'tax_collected', label: 'Tax Collected',
    amount: taxTotal, expected: null, variance: null, indent: 1, drillType: null,
  });

  stages.push({
    stage: 'service_charges', label: 'Service Charges',
    amount: serviceChargeTotal, expected: null, variance: null, indent: 1, drillType: null,
  });

  // 2. Tips + Tenders (from API)
  const totalTips = tendersSummary.tipsCents;
  const grossTenders = tendersSummary.totalCents;
  const cashTenders = tendersSummary.cashCents;
  const cardTenders = tendersSummary.cardCents;
  const otherTenders = tendersSummary.otherCents;

  stages.push({
    stage: 'tips', label: 'Tips',
    amount: totalTips, expected: null, variance: null, indent: 1, drillType: null,
  });

  const expectedGross = netSales + taxTotal + serviceChargeTotal + totalTips;
  const tenderVariance = grossTenders - expectedGross;

  stages.push({
    stage: 'gross_tenders', label: 'Gross Tenders',
    amount: grossTenders, expected: expectedGross, variance: tenderVariance,
    indent: 0, drillType: 'tenders',
  });

  stages.push({
    stage: 'cash_tenders', label: 'Cash Tenders',
    amount: cashTenders, expected: null, variance: null, indent: 1, drillType: 'tenders',
  });

  stages.push({
    stage: 'card_tenders', label: 'Card Tenders',
    amount: cardTenders, expected: null, variance: null, indent: 1, drillType: 'tenders',
  });

  stages.push({
    stage: 'other_tenders', label: 'Other Tenders',
    amount: otherTenders, expected: null, variance: null, indent: 1, drillType: 'tenders',
  });

  // 3. Card settlements (local — need dollar amounts)
  const { grossSettlements, totalFees, netSettlements, cashDeposits } = localData;
  const settlementVariance = grossSettlements > 0 ? grossSettlements - cardTenders : null;

  stages.push({
    stage: 'card_settlements', label: 'Card Settlements (Gross)',
    amount: grossSettlements, expected: cardTenders > 0 ? cardTenders : null,
    variance: settlementVariance, indent: 0, drillType: 'settlements',
  });

  stages.push({
    stage: 'processing_fees', label: 'Processing Fees',
    amount: -totalFees, expected: null, variance: null, indent: 1, drillType: null,
  });

  stages.push({
    stage: 'net_deposits_card', label: 'Net Card Deposits',
    amount: netSettlements, expected: null, variance: null, indent: 1, drillType: null,
  });

  // 4. Cash deposits (local — need dollar amounts)
  const cashVariance = cashDeposits > 0 ? cashDeposits - cashTenders : null;

  stages.push({
    stage: 'cash_deposits', label: 'Cash Deposits',
    amount: cashDeposits, expected: cashTenders > 0 ? cashTenders : null,
    variance: cashVariance, indent: 0, drillType: 'deposits',
  });

  // 5. Over/short (from API)
  stages.push({
    stage: 'over_short', label: 'Cash Over/Short',
    amount: overShort, expected: 0, variance: overShort, indent: 0, drillType: null,
  });

  const totalVariance = stages
    .filter((s) => s.variance !== null)
    .reduce((sum, s) => sum + Math.abs(s.variance!), 0);

  return {
    businessDate: input.businessDate,
    locationId: input.locationId ?? null,
    stages,
    totalVariance,
    isBalanced: totalVariance < 100, // within $1.00
  };
}
