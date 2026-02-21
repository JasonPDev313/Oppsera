import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetDaypartSalesInput } from '../validation';

export interface DaypartSalesRow {
  id: string;
  locationId: string;
  businessDate: string;
  daypart: string;
  covers: number;
  orderCount: number;
  grossSales: number;
  netSales: number;
  avgCheck: number;
  topItemsJson: unknown | null;
}

export interface DaypartSalesResult {
  items: DaypartSalesRow[];
}

export async function getDaypartSales(
  input: GetDaypartSalesInput,
): Promise<DaypartSalesResult> {
  const { tenantId, locationId, startDate, endDate, daypart } = input;

  return withTenant(tenantId, async (tx) => {
    const daypartFilter = daypart
      ? sql` AND daypart = ${daypart}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id, location_id, business_date, daypart,
        covers, order_count, gross_sales, net_sales, avg_check, top_items_json
      FROM rm_fnb_daypart_sales
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${daypartFilter}
      ORDER BY business_date DESC, daypart ASC
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      businessDate: String(r.business_date),
      daypart: String(r.daypart),
      covers: Number(r.covers),
      orderCount: Number(r.order_count),
      grossSales: Number(r.gross_sales),
      netSales: Number(r.net_sales),
      avgCheck: Number(r.avg_check),
      topItemsJson: r.top_items_json ?? null,
    }));

    return { items };
  });
}
