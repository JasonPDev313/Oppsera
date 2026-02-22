import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

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
  return withTenant(input.tenantId, async (tx) => {
    const stages: WaterfallStage[] = [];
    const locationFilter = input.locationId
      ? sql` AND location_id = ${input.locationId}`
      : sql``;

    // 1. Orders Total (gross line amounts)
    const orderRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(ol.extended_price_cents), 0)::bigint AS gross_sales,
        COALESCE(SUM(ol.discount_amount_cents), 0)::bigint AS discount_total,
        COALESCE(SUM(ol.tax_amount_cents), 0)::bigint AS tax_total,
        COALESCE(SUM(ol.service_charge_cents), 0)::bigint AS service_charge_total,
        COUNT(DISTINCT o.id)::int AS order_count
      FROM orders o
      JOIN order_lines ol ON ol.order_id = o.id
      WHERE o.tenant_id = ${input.tenantId}
        AND o.business_date = ${input.businessDate}
        AND o.status != 'voided'
        ${locationFilter}
    `);
    const orderArr = Array.from(orderRows as Iterable<Record<string, unknown>>);
    const grossSales = Number(orderArr[0]?.gross_sales ?? 0);
    const discountTotal = Number(orderArr[0]?.discount_total ?? 0);
    const taxTotal = Number(orderArr[0]?.tax_total ?? 0);
    const serviceChargeTotal = Number(orderArr[0]?.service_charge_total ?? 0);
    const netSales = grossSales - discountTotal;

    stages.push({
      stage: 'orders_total',
      label: 'Orders Total (Gross Sales)',
      amount: grossSales,
      expected: null,
      variance: null,
      indent: 0,
      drillType: 'orders',
    });

    stages.push({
      stage: 'discounts',
      label: 'Discounts',
      amount: -discountTotal,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    stages.push({
      stage: 'net_sales',
      label: 'Net Sales',
      amount: netSales,
      expected: null,
      variance: null,
      indent: 0,
      drillType: null,
    });

    stages.push({
      stage: 'tax_collected',
      label: 'Tax Collected',
      amount: taxTotal,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    stages.push({
      stage: 'service_charges',
      label: 'Service Charges',
      amount: serviceChargeTotal,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    // 2. Tips (from tenders)
    const tipRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(t.tip_amount), 0)::bigint AS total_tips
      FROM tenders t
      JOIN orders o ON o.id = t.order_id
      WHERE t.tenant_id = ${input.tenantId}
        AND o.business_date = ${input.businessDate}
        AND t.status = 'completed'
        ${locationFilter}
    `);
    const tipArr = Array.from(tipRows as Iterable<Record<string, unknown>>);
    const totalTips = Number(tipArr[0]?.total_tips ?? 0);

    stages.push({
      stage: 'tips',
      label: 'Tips',
      amount: totalTips,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    // Expected gross tenders = net sales + tax + service charges + tips
    const expectedGross = netSales + taxTotal + serviceChargeTotal + totalTips;

    // 3. Gross Tenders
    const tenderRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(t.amount), 0)::bigint AS gross_tenders,
        COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.amount ELSE 0 END), 0)::bigint AS cash_tenders,
        COALESCE(SUM(CASE WHEN t.tender_type IN ('credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::bigint AS card_tenders,
        COALESCE(SUM(CASE WHEN t.tender_type NOT IN ('cash', 'credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::bigint AS other_tenders,
        COALESCE(SUM(t.tip_amount), 0)::bigint AS tender_tips
      FROM tenders t
      JOIN orders o ON o.id = t.order_id
      WHERE t.tenant_id = ${input.tenantId}
        AND o.business_date = ${input.businessDate}
        AND t.status = 'completed'
        ${locationFilter}
    `);
    const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
    const grossTenders = Number(tenderArr[0]?.gross_tenders ?? 0);
    const cashTenders = Number(tenderArr[0]?.cash_tenders ?? 0);
    const cardTenders = Number(tenderArr[0]?.card_tenders ?? 0);
    const otherTenders = Number(tenderArr[0]?.other_tenders ?? 0);

    const tenderVariance = grossTenders - expectedGross;

    stages.push({
      stage: 'gross_tenders',
      label: 'Gross Tenders',
      amount: grossTenders,
      expected: expectedGross,
      variance: tenderVariance,
      indent: 0,
      drillType: 'tenders',
    });

    stages.push({
      stage: 'cash_tenders',
      label: 'Cash Tenders',
      amount: cashTenders,
      expected: null,
      variance: null,
      indent: 1,
      drillType: 'tenders',
    });

    stages.push({
      stage: 'card_tenders',
      label: 'Card Tenders',
      amount: cardTenders,
      expected: null,
      variance: null,
      indent: 1,
      drillType: 'tenders',
    });

    stages.push({
      stage: 'other_tenders',
      label: 'Other Tenders',
      amount: otherTenders,
      expected: null,
      variance: null,
      indent: 1,
      drillType: 'tenders',
    });

    // 4. Card Settlements
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
    const grossSettlements = Number(settlementArr[0]?.gross_settlements ?? 0);
    const totalFees = Number(settlementArr[0]?.total_fees ?? 0);
    const netSettlements = Number(settlementArr[0]?.net_settlements ?? 0);

    const settlementVariance = grossSettlements > 0 ? grossSettlements - cardTenders : null;

    stages.push({
      stage: 'card_settlements',
      label: 'Card Settlements (Gross)',
      amount: grossSettlements,
      expected: cardTenders > 0 ? cardTenders : null,
      variance: settlementVariance,
      indent: 0,
      drillType: 'settlements',
    });

    stages.push({
      stage: 'processing_fees',
      label: 'Processing Fees',
      amount: -totalFees,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    stages.push({
      stage: 'net_deposits_card',
      label: 'Net Card Deposits',
      amount: netSettlements,
      expected: null,
      variance: null,
      indent: 1,
      drillType: null,
    });

    // 5. Cash Deposits
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
    const cashDeposits = Number(depositArr[0]?.cash_deposits ?? 0);

    const cashVariance = cashDeposits > 0 ? cashDeposits - cashTenders : null;

    stages.push({
      stage: 'cash_deposits',
      label: 'Cash Deposits',
      amount: cashDeposits,
      expected: cashTenders > 0 ? cashTenders : null,
      variance: cashVariance,
      indent: 0,
      drillType: 'deposits',
    });

    // 6. Over/Short summary
    const overShortRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(cash_over_short_cents), 0)::bigint AS over_short
      FROM retail_close_batches
      WHERE tenant_id = ${input.tenantId}
        AND business_date = ${input.businessDate}
        AND status IN ('reconciled', 'posted', 'locked')
        ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
    `);
    const overShortArr = Array.from(overShortRows as Iterable<Record<string, unknown>>);
    const overShort = Number(overShortArr[0]?.over_short ?? 0);

    stages.push({
      stage: 'over_short',
      label: 'Cash Over/Short',
      amount: overShort,
      expected: 0,
      variance: overShort,
      indent: 0,
      drillType: null,
    });

    // Compute total variance
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
  });
}
