import { eq, and, gte, sql } from 'drizzle-orm';
import { withTenant, rmDailySales, rmInventoryOnHand, rmCustomerActivity } from '@oppsera/db';

export interface GetDashboardMetricsInput {
  tenantId: string;
  locationId?: string;
  date?: string; // 'YYYY-MM-DD', defaults to today
}

export interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers30d: number;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves dashboard summary metrics.
 *
 * - todaySales: net sales for the given date
 * - todayOrders: order count for the given date
 * - todayVoids: void count for the given date
 * - lowStockCount: items below threshold
 * - activeCustomers30d: customers with a visit in the last 30 days
 */
export async function getDashboardMetrics(
  input: GetDashboardMetricsInput,
): Promise<DashboardMetrics> {
  const today = input.date ?? new Date().toISOString().slice(0, 10);

  return withTenant(input.tenantId, async (tx) => {
    // 1. Daily sales metrics for the given date
    const salesConditions = [
      eq(rmDailySales.tenantId, input.tenantId),
      eq(rmDailySales.businessDate, today),
    ];
    if (input.locationId) {
      salesConditions.push(eq(rmDailySales.locationId, input.locationId));
    }

    const [salesRow] = await tx
      .select({
        netSales: sql<string>`coalesce(sum(${rmDailySales.netSales}), 0)::numeric(19,4)`,
        orderCount: sql<number>`coalesce(sum(${rmDailySales.orderCount}), 0)::int`,
        voidCount: sql<number>`coalesce(sum(${rmDailySales.voidCount}), 0)::int`,
      })
      .from(rmDailySales)
      .where(and(...salesConditions));

    // 2. Low stock count
    const stockConditions = [
      eq(rmInventoryOnHand.tenantId, input.tenantId),
      eq(rmInventoryOnHand.isBelowThreshold, true),
    ];
    if (input.locationId) {
      stockConditions.push(eq(rmInventoryOnHand.locationId, input.locationId));
    }

    const [stockRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(rmInventoryOnHand)
      .where(and(...stockConditions));

    // 3. Active customers in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [customerRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(rmCustomerActivity)
      .where(
        and(
          eq(rmCustomerActivity.tenantId, input.tenantId),
          gte(rmCustomerActivity.lastVisitAt, thirtyDaysAgo),
        ),
      );

    return {
      todaySales: num(salesRow?.netSales),
      todayOrders: salesRow?.orderCount ?? 0,
      todayVoids: salesRow?.voidCount ?? 0,
      lowStockCount: stockRow?.count ?? 0,
      activeCustomers30d: customerRow?.count ?? 0,
    };
  });
}
