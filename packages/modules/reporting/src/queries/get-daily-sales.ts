import { eq, and, gte, lte, asc, sql } from 'drizzle-orm';
import { withTenant, rmDailySales } from '@oppsera/db';

export interface GetDailySalesInput {
  tenantId: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface DailySalesRow {
  businessDate: string;
  locationId: string | null;
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  taxTotal: number;
  netSales: number;
  tenderCash: number;
  tenderCard: number;
  tenderGiftCard: number;
  tenderHouseAccount: number;
  tenderAch: number;
  tenderOther: number;
  tipTotal: number;
  serviceChargeTotal: number;
  surchargeTotal: number;
  returnTotal: number;
  voidCount: number;
  voidTotal: number;
  avgOrderValue: number;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves daily sales data for a date range.
 *
 * Prefers CQRS read models (rm_daily_sales) for speed.
 * Falls back to querying operational tables directly when read models are empty
 * (e.g., after direct seeding that bypassed the event system).
 *
 * - With locationId: returns per-date rows for that location.
 * - Without locationId: aggregates across all locations per date,
 *   recomputing avgOrderValue as SUM(netSales) / SUM(orderCount).
 */
export async function getDailySales(input: GetDailySalesInput): Promise<DailySalesRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const dateConditions = [
      eq(rmDailySales.tenantId, input.tenantId),
      gte(rmDailySales.businessDate, input.dateFrom),
      lte(rmDailySales.businessDate, input.dateTo),
    ];

    if (input.locationId) {
      // Single location — direct select
      dateConditions.push(eq(rmDailySales.locationId, input.locationId));

      const rows = await tx
        .select()
        .from(rmDailySales)
        .where(and(...dateConditions))
        .orderBy(asc(rmDailySales.businessDate));

      if (rows.length > 0) {
        return rows.map((r) => ({
          businessDate: r.businessDate,
          locationId: r.locationId,
          orderCount: r.orderCount,
          grossSales: num(r.grossSales),
          discountTotal: num(r.discountTotal),
          taxTotal: num(r.taxTotal),
          netSales: num(r.netSales),
          tenderCash: num(r.tenderCash),
          tenderCard: num(r.tenderCard),
          tenderGiftCard: num(r.tenderGiftCard),
          tenderHouseAccount: num(r.tenderHouseAccount),
          tenderAch: num(r.tenderAch),
          tenderOther: num(r.tenderOther),
          tipTotal: num(r.tipTotal),
          serviceChargeTotal: num(r.serviceChargeTotal),
          surchargeTotal: num(r.surchargeTotal),
          returnTotal: num(r.returnTotal),
          voidCount: r.voidCount,
          voidTotal: num(r.voidTotal),
          avgOrderValue: num(r.avgOrderValue),
        }));
      }

      // Fallback: query operational orders table when read model is empty
      return queryOrdersFallback(tx, input.tenantId, input.dateFrom, input.dateTo, input.locationId);
    }

    // Multi-location — aggregate across all locations per date
    const rows = await tx
      .select({
        businessDate: rmDailySales.businessDate,
        orderCount: sql<number>`sum(${rmDailySales.orderCount})::int`,
        grossSales: sql<string>`sum(${rmDailySales.grossSales})::numeric(19,4)`,
        discountTotal: sql<string>`sum(${rmDailySales.discountTotal})::numeric(19,4)`,
        taxTotal: sql<string>`sum(${rmDailySales.taxTotal})::numeric(19,4)`,
        netSales: sql<string>`sum(${rmDailySales.netSales})::numeric(19,4)`,
        tenderCash: sql<string>`sum(${rmDailySales.tenderCash})::numeric(19,4)`,
        tenderCard: sql<string>`sum(${rmDailySales.tenderCard})::numeric(19,4)`,
        tenderGiftCard: sql<string>`sum(${rmDailySales.tenderGiftCard})::numeric(19,4)`,
        tenderHouseAccount: sql<string>`sum(${rmDailySales.tenderHouseAccount})::numeric(19,4)`,
        tenderAch: sql<string>`sum(${rmDailySales.tenderAch})::numeric(19,4)`,
        tenderOther: sql<string>`sum(${rmDailySales.tenderOther})::numeric(19,4)`,
        tipTotal: sql<string>`sum(${rmDailySales.tipTotal})::numeric(19,4)`,
        serviceChargeTotal: sql<string>`sum(${rmDailySales.serviceChargeTotal})::numeric(19,4)`,
        surchargeTotal: sql<string>`sum(${rmDailySales.surchargeTotal})::numeric(19,4)`,
        returnTotal: sql<string>`sum(${rmDailySales.returnTotal})::numeric(19,4)`,
        voidCount: sql<number>`sum(${rmDailySales.voidCount})::int`,
        voidTotal: sql<string>`sum(${rmDailySales.voidTotal})::numeric(19,4)`,
        avgOrderValue: sql<string>`case when sum(${rmDailySales.orderCount}) > 0
          then (sum(${rmDailySales.netSales}) / sum(${rmDailySales.orderCount}))::numeric(19,4)
          else 0 end`,
      })
      .from(rmDailySales)
      .where(and(...dateConditions))
      .groupBy(rmDailySales.businessDate)
      .orderBy(asc(rmDailySales.businessDate));

    if (rows.length > 0) {
      return rows.map((r) => ({
        businessDate: r.businessDate,
        locationId: null,
        orderCount: r.orderCount,
        grossSales: num(r.grossSales),
        discountTotal: num(r.discountTotal),
        taxTotal: num(r.taxTotal),
        netSales: num(r.netSales),
        tenderCash: num(r.tenderCash),
        tenderCard: num(r.tenderCard),
        tenderGiftCard: num(r.tenderGiftCard),
        tenderHouseAccount: num(r.tenderHouseAccount),
        tenderAch: num(r.tenderAch),
        tenderOther: num(r.tenderOther),
        tipTotal: num(r.tipTotal),
        serviceChargeTotal: num(r.serviceChargeTotal),
        surchargeTotal: num(r.surchargeTotal),
        returnTotal: num(r.returnTotal),
        voidCount: r.voidCount,
        voidTotal: num(r.voidTotal),
        avgOrderValue: num(r.avgOrderValue),
      }));
    }

    // Fallback: query operational orders table when read model is empty
    return queryOrdersFallback(tx, input.tenantId, input.dateFrom, input.dateTo);
  });
}

/**
 * Fallback: query operational orders + tenders tables directly
 * when rm_daily_sales read model is empty (e.g., seed data, consumers not yet run).
 * Converts cents → dollars to match read model format.
 */
async function queryOrdersFallback(
  tx: any,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  locationId?: string,
): Promise<DailySalesRow[]> {
  const locFilter = locationId
    ? sql` AND o.location_id = ${locationId}`
    : sql``;

  const rows = await tx.execute(sql`
    SELECT
      COALESCE(o.business_date, o.created_at::date::text) AS business_date,
      ${locationId ?? sql`NULL`} AS location_id,
      count(*)::int AS order_count,
      coalesce(sum(CASE WHEN o.status != 'voided' THEN o.subtotal ELSE 0 END), 0)::bigint AS gross_sales_cents,
      coalesce(sum(CASE WHEN o.status != 'voided' THEN o.discount_total ELSE 0 END), 0)::bigint AS discount_total_cents,
      coalesce(sum(CASE WHEN o.status != 'voided' THEN o.tax_total ELSE 0 END), 0)::bigint AS tax_total_cents,
      coalesce(sum(CASE WHEN o.status != 'voided' THEN o.total ELSE 0 END), 0)::bigint AS net_sales_cents,
      coalesce(sum(CASE WHEN o.status = 'voided' THEN 1 ELSE 0 END), 0)::int AS void_count,
      coalesce(sum(CASE WHEN o.status = 'voided' THEN o.total ELSE 0 END), 0)::bigint AS void_total_cents
    FROM orders o
    WHERE o.tenant_id = ${tenantId}
      AND o.status IN ('placed', 'paid', 'voided')
      AND COALESCE(o.business_date, o.created_at::date::text) >= ${dateFrom}
      AND COALESCE(o.business_date, o.created_at::date::text) <= ${dateTo}
      ${locFilter}
    GROUP BY COALESCE(o.business_date, o.created_at::date::text)
    ORDER BY business_date ASC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
    const orderCount = Number(r.order_count) || 0;
    const grossSales = (Number(r.gross_sales_cents) || 0) / 100;
    const discountTotal = (Number(r.discount_total_cents) || 0) / 100;
    const taxTotal = (Number(r.tax_total_cents) || 0) / 100;
    const netSales = (Number(r.net_sales_cents) || 0) / 100;
    const voidTotal = (Number(r.void_total_cents) || 0) / 100;

    return {
      businessDate: String(r.business_date),
      locationId: locationId ?? null,
      orderCount,
      grossSales,
      discountTotal,
      taxTotal,
      netSales,
      tenderCash: 0,
      tenderCard: 0,
      tenderGiftCard: 0,
      tenderHouseAccount: 0,
      tenderAch: 0,
      tenderOther: 0,
      tipTotal: 0,
      serviceChargeTotal: 0,
      surchargeTotal: 0,
      returnTotal: 0,
      voidCount: Number(r.void_count) || 0,
      voidTotal,
      avgOrderValue: orderCount > 0 ? netSales / orderCount : 0,
    };
  });
}
