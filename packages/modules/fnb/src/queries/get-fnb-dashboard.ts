import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetFnbDashboardInput } from '../validation';

export interface FnbDashboardMetrics {
  totalCovers: number;
  totalSales: number;
  avgCheck: number;
  tablesTurned: number;
  avgTurnTimeMinutes: number | null;
  tipTotal: number;
  tipPercentage: number | null;
  kitchenAvgTicketTimeSeconds: number | null;
  ticketsPastThreshold: number;
  voidCount: number;
  totalComps: number;
  totalDiscounts: number;
  topServer: { serverUserId: string; totalSales: number } | null;
  daypartBreakdown: Array<{
    daypart: string;
    covers: number;
    grossSales: number;
  }>;
  hourlySales: Array<{
    hour: number;
    salesCents: number;
    covers: number;
  }>;
}

export async function getFnbDashboard(
  input: GetFnbDashboardInput,
): Promise<FnbDashboardMetrics> {
  const { tenantId, locationId, businessDate } = input;

  return withTenant(tenantId, async (tx) => {
    // 1. Server performance aggregates
    const serverRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(covers), 0) AS total_covers,
        COALESCE(SUM(total_sales), 0) AS total_sales,
        COALESCE(SUM(tables_turned), 0) AS tables_turned,
        COALESCE(SUM(tip_total), 0) AS tip_total
      FROM rm_fnb_server_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
    `);

    const serverAgg = Array.from(serverRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const totalCovers = Number(serverAgg.total_covers ?? 0);
    const totalSales = Number(serverAgg.total_sales ?? 0);
    const tablesTurned = Number(serverAgg.tables_turned ?? 0);
    const tipTotal = Number(serverAgg.tip_total ?? 0);

    const avgCheck = tablesTurned > 0 ? Number((totalSales / tablesTurned).toFixed(2)) : 0;
    const tipPercentage = totalSales > 0 ? Number(((tipTotal / totalSales) * 100).toFixed(2)) : null;

    // 2. Average turn time
    const turnRows = await tx.execute(sql`
      SELECT
        ROUND(
          SUM(avg_turn_time_minutes * tables_turned) / NULLIF(SUM(tables_turned), 0)
        ) AS weighted_avg_turn
      FROM rm_fnb_server_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
        AND avg_turn_time_minutes IS NOT NULL
    `);
    const turnAgg = Array.from(turnRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const avgTurnTimeMinutes = turnAgg.weighted_avg_turn != null ? Number(turnAgg.weighted_avg_turn) : null;

    // 3. Top server
    const topServerRows = await tx.execute(sql`
      SELECT server_user_id, total_sales
      FROM rm_fnb_server_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      ORDER BY total_sales DESC
      LIMIT 1
    `);
    const topServerArr = Array.from(topServerRows as Iterable<Record<string, unknown>>);
    const topServer = topServerArr.length > 0
      ? { serverUserId: String(topServerArr[0]!.server_user_id), totalSales: Number(topServerArr[0]!.total_sales) }
      : null;

    // 4. Kitchen performance
    const kitchenRows = await tx.execute(sql`
      SELECT
        ROUND(
          SUM(avg_ticket_time_seconds * tickets_processed) / NULLIF(SUM(tickets_processed), 0)
        ) AS weighted_avg_ticket,
        COALESCE(SUM(tickets_past_threshold), 0) AS total_past_threshold
      FROM rm_fnb_kitchen_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
        AND avg_ticket_time_seconds IS NOT NULL
    `);
    const kitchenAgg = Array.from(kitchenRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const kitchenAvgTicketTimeSeconds = kitchenAgg.weighted_avg_ticket != null
      ? Number(kitchenAgg.weighted_avg_ticket) : null;
    const ticketsPastThreshold = Number(kitchenAgg.total_past_threshold ?? 0);

    // 5. Discount/comp analysis
    const compRows = await tx.execute(sql`
      SELECT
        COALESCE(void_count, 0) AS void_count,
        COALESCE(total_comps, 0) AS total_comps,
        COALESCE(total_discounts, 0) AS total_discounts
      FROM rm_fnb_discount_comp_analysis
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
    `);
    const compAgg = Array.from(compRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const voidCount = Number(compAgg.void_count ?? 0);
    const totalComps = Number(compAgg.total_comps ?? 0);
    const totalDiscounts = Number(compAgg.total_discounts ?? 0);

    // 6. Daypart breakdown
    const daypartRows = await tx.execute(sql`
      SELECT daypart, covers, gross_sales
      FROM rm_fnb_daypart_sales
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      ORDER BY daypart ASC
    `);
    const daypartBreakdown = Array.from(daypartRows as Iterable<Record<string, unknown>>).map((r) => ({
      daypart: String(r.daypart),
      covers: Number(r.covers),
      grossSales: Number(r.gross_sales),
    }));

    // 7. Hourly sales
    const hourlyRows = await tx.execute(sql`
      SELECT hour, sales_cents, covers
      FROM rm_fnb_hourly_sales
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      ORDER BY hour ASC
    `);
    const hourlySales = Array.from(hourlyRows as Iterable<Record<string, unknown>>).map((r) => ({
      hour: Number(r.hour),
      salesCents: Number(r.sales_cents),
      covers: Number(r.covers),
    }));

    return {
      totalCovers,
      totalSales,
      avgCheck,
      tablesTurned,
      avgTurnTimeMinutes,
      tipTotal,
      tipPercentage,
      kitchenAvgTicketTimeSeconds,
      ticketsPastThreshold,
      voidCount,
      totalComps,
      totalDiscounts,
      topServer,
      daypartBreakdown,
      hourlySales,
    };
  });
}
