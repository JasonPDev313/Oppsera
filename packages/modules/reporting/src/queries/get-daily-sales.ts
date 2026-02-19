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
  voidCount: number;
  voidTotal: number;
  avgOrderValue: number;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;

/**
 * Retrieves daily sales data for a date range.
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
        voidCount: r.voidCount,
        voidTotal: num(r.voidTotal),
        avgOrderValue: num(r.avgOrderValue),
      }));
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
      voidCount: r.voidCount,
      voidTotal: num(r.voidTotal),
      avgOrderValue: num(r.avgOrderValue),
    }));
  });
}
