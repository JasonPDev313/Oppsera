import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  withTenant,
  rmInventoryOnHand,
  rmCustomerActivity,
  rmDailySales,
} from '@oppsera/db';

export interface GetDashboardMetricsInput {
  tenantId: string;
  locationId?: string;
  date?: string; // 'YYYY-MM-DD', defaults to today (end of range)
  fromDate?: string; // 'YYYY-MM-DD', start of range (inclusive)
}

export interface NonPosRevenue {
  pms: number;
  ar: number;
  membership: number;
  voucher: number;
}

export interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers7d: number;
  /** 'today' for single-date, 'range' for date range, 'all' for all-time fallback */
  period: 'today' | 'range' | 'all';
  /** Total business revenue including non-POS sources */
  totalBusinessRevenue: number;
  /** Breakdown of non-POS revenue by source */
  nonPosRevenue: NonPosRevenue;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves dashboard summary metrics.
 *
 * Supports date range via fromDate/date params (e.g., last 7 days).
 * Prefers CQRS read models (rm_daily_sales, rm_inventory_on_hand) for speed.
 * Falls back to querying operational tables directly when read models are empty
 * (e.g., after direct seeding that bypassed the event system).
 * Uses rm_daily_sales for non-POS revenue breakdown (PMS, AR, membership, voucher).
 */
export async function getDashboardMetrics(
  input: GetDashboardMetricsInput,
): Promise<DashboardMetrics> {
  const today = input.date ?? new Date().toISOString().slice(0, 10);
  const fromDate = input.fromDate;
  const isRange = !!fromDate;

  return withTenant(input.tenantId, async (tx) => {
    // 1. Daily sales metrics — try read model first (fast indexed lookup)
    const salesConditions = [
      eq(rmDailySales.tenantId, input.tenantId),
    ];
    if (isRange) {
      salesConditions.push(gte(rmDailySales.businessDate, fromDate));
      salesConditions.push(lte(rmDailySales.businessDate, today));
    } else {
      salesConditions.push(eq(rmDailySales.businessDate, today));
    }
    if (input.locationId) {
      salesConditions.push(eq(rmDailySales.locationId, input.locationId));
    }

    const [salesRow] = await tx
      .select({
        netSales: sql<string>`coalesce(sum(${rmDailySales.netSales}), 0)::numeric(19,4)`,
        orderCount: sql<number>`coalesce(sum(${rmDailySales.orderCount}), 0)::int`,
        voidCount: sql<number>`coalesce(sum(${rmDailySales.voidCount}), 0)::int`,
        pmsRevenue: sql<string>`coalesce(sum(${rmDailySales.pmsRevenue}), 0)`,
        arRevenue: sql<string>`coalesce(sum(${rmDailySales.arRevenue}), 0)`,
        membershipRevenue: sql<string>`coalesce(sum(${rmDailySales.membershipRevenue}), 0)`,
        voucherRevenue: sql<string>`coalesce(sum(${rmDailySales.voucherRevenue}), 0)`,
        totalBusinessRevenue: sql<string>`coalesce(sum(${rmDailySales.totalBusinessRevenue}), 0)`,
      })
      .from(rmDailySales)
      .where(and(...salesConditions));

    let todaySales = num(salesRow?.netSales);
    let todayOrders = salesRow?.orderCount ?? 0;
    let todayVoids = salesRow?.voidCount ?? 0;
    let period: 'today' | 'range' | 'all' = isRange ? 'range' : 'today';
    let totalBusinessRevenue = todaySales;
    const nonPosRevenue: NonPosRevenue = {
      pms: num(salesRow?.pmsRevenue),
      ar: num(salesRow?.arRevenue),
      membership: num(salesRow?.membershipRevenue),
      voucher: num(salesRow?.voucherRevenue),
    };
    const rmTotalBizRev = num(salesRow?.totalBusinessRevenue);
    if (rmTotalBizRev > 0) {
      totalBusinessRevenue = rmTotalBizRev;
    }

    // Fallback: query operational orders table when read model is empty
    if (todayOrders === 0) {
      const locFilter = input.locationId
        ? sql` AND location_id = ${input.locationId}`
        : sql``;

      // Try date range or today's business_date (sargable — uses index)
      const dateFilter = isRange
        ? sql`AND business_date >= ${fromDate} AND business_date <= ${today}`
        : sql`AND business_date = ${today}`;

      const [fallbackRow] = await tx.execute(sql`
        SELECT
          coalesce(sum(CASE WHEN status != 'voided' THEN total ELSE 0 END), 0)::bigint AS net_sales_cents,
          count(*)::int AS order_count,
          count(*) FILTER (WHERE status = 'voided')::int AS void_count
        FROM orders
        WHERE tenant_id = ${input.tenantId}
          ${dateFilter}
          AND status IN ('placed', 'paid', 'voided')
          ${locFilter}
      `);

      if (fallbackRow) {
        const row = fallbackRow as Record<string, unknown>;
        const fallbackOrders = Number(row.order_count) || 0;
        if (fallbackOrders > 0) {
          todaySales = (Number(row.net_sales_cents) || 0) / 100;
          todayOrders = fallbackOrders;
          todayVoids = Number(row.void_count) || 0;
          totalBusinessRevenue = todaySales;
        }
      }

      // Final fallback: all orders regardless of date (handles NULL business_date
      // and seed data with dates from other days)
      if (todayOrders === 0) {
        const [allTimeRow] = await tx.execute(sql`
          SELECT
            coalesce(sum(CASE WHEN status != 'voided' THEN total ELSE 0 END), 0)::bigint AS net_sales_cents,
            count(*)::int AS order_count,
            count(*) FILTER (WHERE status = 'voided')::int AS void_count
          FROM orders
          WHERE tenant_id = ${input.tenantId}
            AND status IN ('placed', 'paid', 'voided')
            ${locFilter}
        `);

        if (allTimeRow) {
          const row = allTimeRow as Record<string, unknown>;
          const allOrders = Number(row.order_count) || 0;
          if (allOrders > 0) {
            todaySales = (Number(row.net_sales_cents) || 0) / 100;
            todayOrders = allOrders;
            todayVoids = Number(row.void_count) || 0;
            period = 'all';
            totalBusinessRevenue = todaySales;
          }
        }
      }
    }

    // 2. Low stock count — try read model first
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

    let lowStockCount = stockRow?.count ?? 0;

    // Fallback: query inventory items + movements when read model is empty
    if (lowStockCount === 0) {
      const stockLocFilter = input.locationId
        ? sql` AND ii.location_id = ${input.locationId}`
        : sql``;

      const [stockFallback] = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM inventory_items ii
        WHERE ii.tenant_id = ${input.tenantId}
          AND ii.reorder_point IS NOT NULL
          AND ii.reorder_point > 0
          ${stockLocFilter}
          AND (
            SELECT coalesce(sum(im.quantity_delta), 0)
            FROM inventory_movements im
            WHERE im.inventory_item_id = ii.id
              AND im.tenant_id = ${input.tenantId}
          ) < ii.reorder_point
      `);

      if (stockFallback) {
        lowStockCount = Number((stockFallback as Record<string, unknown>).cnt) || 0;
      }
    }

    // 3. Active customers in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [customerRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(rmCustomerActivity)
      .where(
        and(
          eq(rmCustomerActivity.tenantId, input.tenantId),
          gte(rmCustomerActivity.lastVisitAt, sevenDaysAgo),
        ),
      );

    let activeCustomers7d = customerRow?.count ?? 0;

    // Fallback: count distinct customers from orders table when read model is empty
    if (activeCustomers7d === 0) {
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
      const custLocFilter = input.locationId
        ? sql` AND location_id = ${input.locationId}`
        : sql``;

      const [custFallback] = await tx.execute(sql`
        SELECT count(DISTINCT customer_id)::int AS cnt
        FROM orders
        WHERE tenant_id = ${input.tenantId}
          AND customer_id IS NOT NULL
          AND status IN ('placed', 'paid')
          AND created_at >= ${sevenDaysAgoStr}::date
          ${custLocFilter}
      `);

      if (custFallback) {
        const cnt = Number((custFallback as Record<string, unknown>).cnt) || 0;
        if (cnt > 0) activeCustomers7d = cnt;
      }

      // Final fallback: all-time distinct customers if date-filtered is still 0
      if (activeCustomers7d === 0) {
        const [allTimeCust] = await tx.execute(sql`
          SELECT count(DISTINCT customer_id)::int AS cnt
          FROM orders
          WHERE tenant_id = ${input.tenantId}
            AND customer_id IS NOT NULL
            AND status IN ('placed', 'paid')
            ${custLocFilter}
        `);

        if (allTimeCust) {
          activeCustomers7d = Number((allTimeCust as Record<string, unknown>).cnt) || 0;
        }
      }
    }

    return {
      todaySales,
      todayOrders,
      todayVoids,
      lowStockCount,
      activeCustomers7d,
      period,
      totalBusinessRevenue,
      nonPosRevenue,
    };
  });
}
