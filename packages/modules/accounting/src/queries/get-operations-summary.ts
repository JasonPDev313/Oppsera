import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

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
  const api = getReconciliationReadApi();

  // Parallel: 5 API calls + local queries for settlement/drawer counts
  const [ordersSummary, compTotals, overShortCents, cashOnHand, outstandingTips, localCounts] = await Promise.all([
    api.getOrdersSummary(input.tenantId, input.startDate, input.endDate, input.locationId),
    api.getCompTotals(input.tenantId, input.startDate, input.endDate, input.locationId),
    api.getOverShortTotal(input.tenantId, input.startDate, input.endDate, input.locationId),
    api.getCashOnHand(input.tenantId, input.startDate, input.endDate, input.locationId),
    api.getOutstandingTipsCents(input.tenantId, input.startDate, input.endDate, input.locationId),
    withTenant(input.tenantId, async (tx) => {
      const locationFilter = input.locationId
        ? sql` AND location_id = ${input.locationId}`
        : sql``;

      // Pending settlements (date-range filter not available on API status method)
      const settlementRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM payment_settlements
        WHERE tenant_id = ${input.tenantId}
          AND status IN ('pending', 'matched')
          AND settlement_date >= ${input.startDate}
          AND settlement_date <= ${input.endDate}
          ${locationFilter}
      `);
      const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);
      const pendingSettlements = settlementArr.length > 0 ? Number(settlementArr[0]!.count) : 0;

      // Active drawer sessions (API uses period, not date range)
      const activeRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM drawer_sessions
        WHERE tenant_id = ${input.tenantId}
          AND status = 'open'
          ${locationFilter}
      `);
      const activeArr = Array.from(activeRows as Iterable<Record<string, unknown>>);
      const activeDrawerSessions = activeArr.length > 0 ? Number(activeArr[0]!.count) : 0;

      return { pendingSettlements, activeDrawerSessions };
    }),
  ]);

  const totalSales = ordersSummary.netSalesCents;
  const orderCount = ordersSummary.orderCount;
  const voidCount = ordersSummary.voidCount;
  const totalOrders = orderCount + voidCount;
  const grossSales = ordersSummary.grossSalesCents;

  return {
    totalSalesCents: totalSales,
    orderCount,
    avgTicketCents: orderCount > 0 ? Math.round(totalSales / orderCount) : 0,
    voidRate: totalOrders > 0 ? Number(((voidCount / totalOrders) * 100).toFixed(1)) : 0,
    discountRate: grossSales > 0 ? Number(((ordersSummary.discountTotalCents / grossSales) * 100).toFixed(1)) : 0,
    compRate: grossSales > 0 ? Number(((compTotals.totalCompsCents / grossSales) * 100).toFixed(1)) : 0,
    overShortCents,
    cashOnHandCents: cashOnHand,
    outstandingTipsCents: outstandingTips,
    pendingSettlements: localCounts.pendingSettlements,
    activeDrawerSessions: localCounts.activeDrawerSessions,
  };
}
