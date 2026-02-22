import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface OperationsSummary {
  totalSalesCents: number;
  orderCount: number;
  avgTicketCents: number;
  voidRate: number;
  discountRate: number;
  compRate: number;
  overShortCents: number;
  cashOnHandCents: number;
  outstandingTipsCents: number;
  pendingSettlements: number;
  activeDrawerSessions: number;
}

/**
 * Operations KPIs across a date range: total sales, avg ticket, void/discount/comp rates, etc.
 */
export async function getOperationsSummary(input: {
  tenantId: string;
  startDate: string;
  endDate: string;
  locationId?: string;
}): Promise<OperationsSummary> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql` AND location_id = ${input.locationId}`
      : sql``;

    // Orders summary
    const orderRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'voided' THEN total ELSE 0 END), 0)::integer AS total_sales,
        COUNT(CASE WHEN status != 'voided' THEN 1 END)::int AS order_count,
        COUNT(CASE WHEN status = 'voided' THEN 1 END)::int AS void_count,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN discount_total ELSE 0 END), 0)::integer AS total_discounts,
        COALESCE(SUM(CASE WHEN status != 'voided' THEN subtotal + tax_total + service_charge_total ELSE 0 END), 0)::integer AS gross_sales
      FROM orders
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        ${locationFilter}
    `);
    const orderArr = Array.from(orderRows as Iterable<Record<string, unknown>>);
    const o = orderArr[0]!;
    const totalSales = Number(o.total_sales);
    const orderCount = Number(o.order_count);
    const voidCount = Number(o.void_count);
    const totalDiscounts = Number(o.total_discounts);
    const grossSales = Number(o.gross_sales);
    const totalOrders = orderCount + voidCount;

    // Comp totals
    const compRows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount_cents), 0)::integer AS total_comps
      FROM comp_events
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
    `);
    const compArr = Array.from(compRows as Iterable<Record<string, unknown>>);
    const totalComps = compArr.length > 0 ? Number(compArr[0]!.total_comps) : 0;

    // Over/short from retail close batches
    const overShortRows = await tx.execute(sql`
      SELECT COALESCE(SUM(cash_over_short_cents), 0)::integer AS over_short
      FROM retail_close_batches
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        AND status IN ('reconciled', 'posted', 'locked')
        ${locationFilter}
    `);
    const overShortArr = Array.from(overShortRows as Iterable<Record<string, unknown>>);
    const overShortCents = overShortArr.length > 0 ? Number(overShortArr[0]!.over_short) : 0;

    // Cash on hand: opening + cash sales + paid_in - paid_out - drops for open sessions
    const cashRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(ds.opening_balance_cents), 0)::integer +
        COALESCE((
          SELECT SUM(t.amount)
          FROM tenders t
          WHERE t.tenant_id = ${input.tenantId}
            AND t.tender_type = 'cash'
            AND t.status = 'captured'
            AND t.business_date >= ${input.startDate}
            AND t.business_date <= ${input.endDate}
            ${input.locationId ? sql` AND t.location_id = ${input.locationId}` : sql``}
        ), 0)::integer AS cash_on_hand
      FROM drawer_sessions ds
      WHERE ds.tenant_id = ${input.tenantId}
        AND ds.status = 'open'
        AND ds.business_date >= ${input.startDate}
        AND ds.business_date <= ${input.endDate}
        ${input.locationId ? sql` AND ds.location_id = ${input.locationId}` : sql``}
    `);
    const cashArr = Array.from(cashRows as Iterable<Record<string, unknown>>);
    const cashOnHand = cashArr.length > 0 ? Number(cashArr[0]!.cash_on_hand) : 0;

    // Outstanding tips
    const tipRows = await tx.execute(sql`
      SELECT
        COALESCE((
          SELECT SUM(t.tip_amount) FROM tenders t
          WHERE t.tenant_id = ${input.tenantId}
            AND t.status = 'captured' AND t.tip_amount > 0
            AND t.business_date >= ${input.startDate}
            AND t.business_date <= ${input.endDate}
            ${input.locationId ? sql` AND t.location_id = ${input.locationId}` : sql``}
        ), 0)::integer -
        COALESCE((
          SELECT SUM(tp.amount_cents) FROM tip_payouts tp
          WHERE tp.tenant_id = ${input.tenantId}
            AND tp.status != 'voided'
            AND tp.business_date >= ${input.startDate}
            AND tp.business_date <= ${input.endDate}
            ${input.locationId ? sql` AND tp.location_id = ${input.locationId}` : sql``}
        ), 0)::integer AS outstanding
    `);
    const tipArr = Array.from(tipRows as Iterable<Record<string, unknown>>);
    const outstandingTips = tipArr.length > 0 ? Math.max(0, Number(tipArr[0]!.outstanding)) : 0;

    // Pending settlements
    const settlementRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM payment_settlements
      WHERE tenant_id = ${input.tenantId}
        AND status IN ('pending', 'matched')
        AND settlement_date >= ${input.startDate}
        AND settlement_date <= ${input.endDate}
        ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
    `);
    const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);
    const pendingSettlements = settlementArr.length > 0 ? Number(settlementArr[0]!.count) : 0;

    // Active drawer sessions
    const activeRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM drawer_sessions
      WHERE tenant_id = ${input.tenantId}
        AND status = 'open'
        ${input.locationId ? sql` AND location_id = ${input.locationId}` : sql``}
    `);
    const activeArr = Array.from(activeRows as Iterable<Record<string, unknown>>);
    const activeDrawerSessions = activeArr.length > 0 ? Number(activeArr[0]!.count) : 0;

    return {
      totalSalesCents: totalSales,
      orderCount,
      avgTicketCents: orderCount > 0 ? Math.round(totalSales / orderCount) : 0,
      voidRate: totalOrders > 0 ? Number(((voidCount / totalOrders) * 100).toFixed(1)) : 0,
      discountRate: grossSales > 0 ? Number(((totalDiscounts / grossSales) * 100).toFixed(1)) : 0,
      compRate: grossSales > 0 ? Number(((totalComps / grossSales) * 100).toFixed(1)) : 0,
      overShortCents,
      cashOnHandCents: cashOnHand,
      outstandingTipsCents: outstandingTips,
      pendingSettlements,
      activeDrawerSessions,
    };
  });
}
