import { eq, and, sql } from 'drizzle-orm';
import { withTenant, rmInventoryOnHand } from '@oppsera/db';

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

/**
 * Retrieves dashboard summary metrics from rm_revenue_activity (sales history).
 *
 * Uses rm_revenue_activity as the single source of truth — it is populated by
 * both event consumers and the seed script, and includes all revenue sources
 * (POS, PMS, AR, membership, voucher).
 *
 * Falls back to all-time aggregation when no data exists in the date range.
 */
export async function getDashboardMetrics(
  input: GetDashboardMetricsInput,
): Promise<DashboardMetrics> {
  const today = input.date ?? new Date().toISOString().slice(0, 10);
  const fromDate = input.fromDate;
  const isRange = !!fromDate;

  return withTenant(input.tenantId, async (tx) => {
    const locFilter = input.locationId
      ? sql` AND location_id = ${input.locationId}`
      : sql``;

    const dateFilter = isRange
      ? sql` AND business_date >= ${fromDate} AND business_date <= ${today}`
      : sql` AND business_date = ${today}`;

    // 1. Revenue & order metrics from rm_revenue_activity (sales history)
    const salesResult = await tx.execute(sql`
      SELECT
        coalesce(sum(CASE WHEN status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS net_sales,
        count(CASE WHEN status != 'voided' THEN 1 END)::int AS order_count,
        count(CASE WHEN status = 'voided' THEN 1 END)::int AS void_count,
        coalesce(sum(CASE WHEN source = 'pms_folio' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS pms_revenue,
        coalesce(sum(CASE WHEN source = 'ar_invoice' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS ar_revenue,
        coalesce(sum(CASE WHEN source = 'membership' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS membership_revenue,
        coalesce(sum(CASE WHEN source IN ('voucher', 'stored_value') AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS voucher_revenue
      FROM rm_revenue_activity
      WHERE tenant_id = ${input.tenantId}
        ${dateFilter}
        ${locFilter}
    `);

    const salesRows = Array.from(salesResult as Iterable<Record<string, unknown>>);
    const salesRow = salesRows[0];

    let todaySales = Number(salesRow?.net_sales) || 0;
    let todayOrders = Number(salesRow?.order_count) || 0;
    let todayVoids = Number(salesRow?.void_count) || 0;
    let period: 'today' | 'range' | 'all' = isRange ? 'range' : 'today';
    const nonPosRevenue: NonPosRevenue = {
      pms: Number(salesRow?.pms_revenue) || 0,
      ar: Number(salesRow?.ar_revenue) || 0,
      membership: Number(salesRow?.membership_revenue) || 0,
      voucher: Number(salesRow?.voucher_revenue) || 0,
    };
    let totalBusinessRevenue = todaySales;

    // Fallback: all-time when no data in the date range
    if (todayOrders === 0) {
      const allTimeResult = await tx.execute(sql`
        SELECT
          coalesce(sum(CASE WHEN status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS net_sales,
          count(CASE WHEN status != 'voided' THEN 1 END)::int AS order_count,
          count(CASE WHEN status = 'voided' THEN 1 END)::int AS void_count,
          coalesce(sum(CASE WHEN source = 'pms_folio' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS pms_revenue,
          coalesce(sum(CASE WHEN source = 'ar_invoice' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS ar_revenue,
          coalesce(sum(CASE WHEN source = 'membership' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS membership_revenue,
          coalesce(sum(CASE WHEN source IN ('voucher', 'stored_value') AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS voucher_revenue
        FROM rm_revenue_activity
        WHERE tenant_id = ${input.tenantId}
          ${locFilter}
      `);

      const allTimeRows = Array.from(allTimeResult as Iterable<Record<string, unknown>>);
      const allTimeRow = allTimeRows[0];
      const allTimeOrders = Number(allTimeRow?.order_count) || 0;

      if (allTimeOrders > 0) {
        todaySales = Number(allTimeRow?.net_sales) || 0;
        todayOrders = allTimeOrders;
        todayVoids = Number(allTimeRow?.void_count) || 0;
        nonPosRevenue.pms = Number(allTimeRow?.pms_revenue) || 0;
        nonPosRevenue.ar = Number(allTimeRow?.ar_revenue) || 0;
        nonPosRevenue.membership = Number(allTimeRow?.membership_revenue) || 0;
        nonPosRevenue.voucher = Number(allTimeRow?.voucher_revenue) || 0;
        totalBusinessRevenue = todaySales;
        period = 'all';
      }
    }

    // 2. Low stock count — read model
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

      const stockFallbackResult = await tx.execute(sql`
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

      const stockFallbackRows = Array.from(stockFallbackResult as Iterable<Record<string, unknown>>);
      if (stockFallbackRows.length > 0) {
        lowStockCount = Number(stockFallbackRows[0]!.cnt) || 0;
      }
    }

    // 3. Active customers in last 7 days — from rm_revenue_activity
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    const custResult = await tx.execute(sql`
      SELECT count(DISTINCT customer_id)::int AS cnt
      FROM rm_revenue_activity
      WHERE tenant_id = ${input.tenantId}
        AND customer_id IS NOT NULL
        AND status != 'voided'
        AND business_date >= ${sevenDaysAgoStr}
        ${locFilter}
    `);

    const custRows = Array.from(custResult as Iterable<Record<string, unknown>>);
    let activeCustomers7d = Number(custRows[0]?.cnt) || 0;

    // Fallback: all-time distinct customers if date-filtered is still 0
    if (activeCustomers7d === 0) {
      const allTimeCustResult = await tx.execute(sql`
        SELECT count(DISTINCT customer_id)::int AS cnt
        FROM rm_revenue_activity
        WHERE tenant_id = ${input.tenantId}
          AND customer_id IS NOT NULL
          AND status != 'voided'
          ${locFilter}
      `);

      const allTimeCustRows = Array.from(allTimeCustResult as Iterable<Record<string, unknown>>);
      activeCustomers7d = Number(allTimeCustRows[0]?.cnt) || 0;
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
