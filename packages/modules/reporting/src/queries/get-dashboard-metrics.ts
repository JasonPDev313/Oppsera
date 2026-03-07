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
  spa: number;
}

export interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers7d: number;
  /** 'today' for single-date, 'range' for date range */
  period: 'today' | 'range';
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
 * Returns zeros when no data exists in the requested date range.
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
        coalesce(sum(CASE WHEN source IN ('voucher', 'stored_value') AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS voucher_revenue,
        coalesce(sum(CASE WHEN source = 'spa' AND status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS spa_revenue
      FROM rm_revenue_activity
      WHERE tenant_id = ${input.tenantId}
        ${dateFilter}
        ${locFilter}
    `);

    const salesRows = Array.from(salesResult as Iterable<Record<string, unknown>>);
    const salesRow = salesRows[0];

    const todaySales = Number(salesRow?.net_sales) || 0;
    const todayOrders = Number(salesRow?.order_count) || 0;
    const todayVoids = Number(salesRow?.void_count) || 0;
    const period: 'today' | 'range' = isRange ? 'range' : 'today';
    const nonPosRevenue: NonPosRevenue = {
      pms: Number(salesRow?.pms_revenue) || 0,
      ar: Number(salesRow?.ar_revenue) || 0,
      membership: Number(salesRow?.membership_revenue) || 0,
      voucher: Number(salesRow?.voucher_revenue) || 0,
      spa: Number(salesRow?.spa_revenue) || 0,
    };
    const totalBusinessRevenue = todaySales + nonPosRevenue.pms + nonPosRevenue.ar + nonPosRevenue.membership + nonPosRevenue.voucher + nonPosRevenue.spa;

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
    const activeCustomers7d = Number(custRows[0]?.cnt) || 0;

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
