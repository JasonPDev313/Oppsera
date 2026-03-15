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

/** Safe Number() — returns 0 for NaN/undefined/null (gotcha #585) */
function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getFnbDashboard(
  input: GetFnbDashboardInput,
): Promise<FnbDashboardMetrics> {
  const { tenantId, locationId, businessDate, endDate } = input;

  // Validate: endDate must not precede businessDate
  if (endDate && endDate < businessDate) {
    return emptyMetrics();
  }

  // When endDate is provided, filter by range; otherwise single day
  const dateFilter = endDate
    ? sql`business_date >= ${businessDate} AND business_date <= ${endDate}`
    : sql`business_date = ${businessDate}`;

  return withTenant(tenantId, async (tx) => {
    // ── All 7 queries are independent reads — run in parallel ────
    const [serverRows, turnRows, topServerRows, kitchenRows, compRows, daypartRows, hourlyRows] =
      await Promise.all([
        // 1. Server performance aggregates
        tx.execute(sql`
          SELECT
            COALESCE(SUM(covers), 0) AS total_covers,
            COALESCE(SUM(total_sales), 0) AS total_sales,
            COALESCE(SUM(tables_turned), 0) AS tables_turned,
            COALESCE(SUM(tip_total), 0) AS tip_total
          FROM rm_fnb_server_performance
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
        `),

        // 2. Average turn time (weighted by tables_turned)
        tx.execute(sql`
          SELECT
            ROUND(
              SUM(avg_turn_time_minutes * tables_turned) / NULLIF(SUM(tables_turned), 0)
            ) AS weighted_avg_turn
          FROM rm_fnb_server_performance
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
            AND avg_turn_time_minutes IS NOT NULL
        `),

        // 3. Top server (aggregated across date range)
        tx.execute(sql`
          SELECT server_user_id, SUM(total_sales) AS total_sales
          FROM rm_fnb_server_performance
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
          GROUP BY server_user_id
          ORDER BY SUM(total_sales) DESC
          LIMIT 1
        `),

        // 4. Kitchen performance (weighted average — FILTER so null tick times don't suppress threshold counts)
        tx.execute(sql`
          SELECT
            ROUND(
              SUM(avg_ticket_time_seconds * tickets_processed)
                FILTER (WHERE avg_ticket_time_seconds IS NOT NULL)
              / NULLIF(SUM(tickets_processed) FILTER (WHERE avg_ticket_time_seconds IS NOT NULL), 0)
            ) AS weighted_avg_ticket,
            COALESCE(SUM(tickets_past_threshold), 0) AS total_past_threshold
          FROM rm_fnb_kitchen_performance
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
        `),

        // 5. Discount/comp analysis
        tx.execute(sql`
          SELECT
            COALESCE(SUM(void_count), 0) AS void_count,
            COALESCE(SUM(total_comps), 0) AS total_comps,
            COALESCE(SUM(total_discounts), 0) AS total_discounts
          FROM rm_fnb_discount_comp_analysis
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
        `),

        // 6. Daypart breakdown
        tx.execute(sql`
          SELECT daypart, SUM(covers) AS covers, SUM(gross_sales) AS gross_sales
          FROM rm_fnb_daypart_sales
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
          GROUP BY daypart
          ORDER BY daypart ASC
        `),

        // 7. Hourly sales
        tx.execute(sql`
          SELECT hour, SUM(sales_cents) AS sales_cents, SUM(covers) AS covers
          FROM rm_fnb_hourly_sales
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND ${dateFilter}
          GROUP BY hour
          ORDER BY hour ASC
        `),
      ]);

    // ── Parse results with NaN guards ───────────────────────────

    const serverAgg = Array.from(serverRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const totalCovers = safeNum(serverAgg.total_covers);
    const totalSales = safeNum(serverAgg.total_sales);
    const tablesTurned = safeNum(serverAgg.tables_turned);
    const tipTotal = safeNum(serverAgg.tip_total);

    const avgCheck = totalCovers > 0 ? Number((totalSales / totalCovers).toFixed(2)) : 0;
    const tipPercentage = totalSales > 0 ? Number(((tipTotal / totalSales) * 100).toFixed(2)) : null;

    const turnAgg = Array.from(turnRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const avgTurnTimeMinutes = turnAgg.weighted_avg_turn != null ? safeNum(turnAgg.weighted_avg_turn) : null;

    const topServerArr = Array.from(topServerRows as Iterable<Record<string, unknown>>);
    const topServer = topServerArr.length > 0
      ? { serverUserId: String(topServerArr[0]!.server_user_id), totalSales: safeNum(topServerArr[0]!.total_sales) }
      : null;

    const kitchenAgg = Array.from(kitchenRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const kitchenAvgTicketTimeSeconds = kitchenAgg.weighted_avg_ticket != null
      ? safeNum(kitchenAgg.weighted_avg_ticket) : null;
    const ticketsPastThreshold = safeNum(kitchenAgg.total_past_threshold);

    const compAgg = Array.from(compRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const voidCount = safeNum(compAgg.void_count);
    const totalComps = safeNum(compAgg.total_comps);
    const totalDiscounts = safeNum(compAgg.total_discounts);

    const daypartBreakdown = Array.from(daypartRows as Iterable<Record<string, unknown>>).map((r) => ({
      daypart: String(r.daypart),
      covers: safeNum(r.covers),
      grossSales: safeNum(r.gross_sales),
    }));

    const hourlySales = Array.from(hourlyRows as Iterable<Record<string, unknown>>).map((r) => ({
      hour: safeNum(r.hour),
      salesCents: safeNum(r.sales_cents),
      covers: safeNum(r.covers),
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

function emptyMetrics(): FnbDashboardMetrics {
  return {
    totalCovers: 0, totalSales: 0, avgCheck: 0, tablesTurned: 0,
    avgTurnTimeMinutes: null, tipTotal: 0, tipPercentage: null,
    kitchenAvgTicketTimeSeconds: null, ticketsPastThreshold: 0,
    voidCount: 0, totalComps: 0, totalDiscounts: 0,
    topServer: null, daypartBreakdown: [], hourlySales: [],
  };
}
