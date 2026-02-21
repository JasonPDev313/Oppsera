import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetHourlySalesInput } from '../validation';

export interface HourlySalesRow {
  id: string;
  locationId: string;
  businessDate: string;
  hour: number;
  covers: number;
  orderCount: number;
  salesCents: number;
}

export interface HourlySalesResult {
  items: HourlySalesRow[];
  aggregated: Array<{
    hour: number;
    totalCovers: number;
    totalOrders: number;
    totalSalesCents: number;
  }>;
}

export async function getHourlySales(
  input: GetHourlySalesInput,
): Promise<HourlySalesResult> {
  const { tenantId, locationId, startDate, endDate } = input;

  return withTenant(tenantId, async (tx) => {
    // Raw daily rows
    const rows = await tx.execute(sql`
      SELECT
        id, location_id, business_date, hour,
        covers, order_count, sales_cents
      FROM rm_fnb_hourly_sales
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
      ORDER BY business_date ASC, hour ASC
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      businessDate: String(r.business_date),
      hour: Number(r.hour),
      covers: Number(r.covers),
      orderCount: Number(r.order_count),
      salesCents: Number(r.sales_cents),
    }));

    // Aggregate by hour across all dates
    const aggRows = await tx.execute(sql`
      SELECT
        hour,
        SUM(covers) AS total_covers,
        SUM(order_count) AS total_orders,
        SUM(sales_cents) AS total_sales_cents
      FROM rm_fnb_hourly_sales
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
      GROUP BY hour
      ORDER BY hour ASC
    `);

    const aggregated = Array.from(aggRows as Iterable<Record<string, unknown>>).map((r) => ({
      hour: Number(r.hour),
      totalCovers: Number(r.total_covers),
      totalOrders: Number(r.total_orders),
      totalSalesCents: Number(r.total_sales_cents),
    }));

    return { items, aggregated };
  });
}
