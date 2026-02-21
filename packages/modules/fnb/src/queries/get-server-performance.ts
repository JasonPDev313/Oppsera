import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetServerPerformanceInput } from '../validation';

export interface ServerPerformanceRow {
  id: string;
  locationId: string;
  serverUserId: string;
  businessDate: string;
  covers: number;
  totalSales: number;
  avgCheck: number;
  tipTotal: number;
  tipPercentage: number | null;
  tablesTurned: number;
  avgTurnTimeMinutes: number | null;
  comps: number;
  voids: number;
}

export interface ServerPerformanceResult {
  items: ServerPerformanceRow[];
}

export async function getServerPerformance(
  input: GetServerPerformanceInput,
): Promise<ServerPerformanceResult> {
  const { tenantId, locationId, startDate, endDate, serverUserId, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const serverFilter = serverUserId
      ? sql` AND server_user_id = ${serverUserId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id, location_id, server_user_id, business_date,
        covers, total_sales, avg_check, tip_total, tip_percentage,
        tables_turned, avg_turn_time_minutes, comps, voids
      FROM rm_fnb_server_performance
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${serverFilter}
      ORDER BY business_date DESC, total_sales DESC
      LIMIT ${limit}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      serverUserId: String(r.server_user_id),
      businessDate: String(r.business_date),
      covers: Number(r.covers),
      totalSales: Number(r.total_sales),
      avgCheck: Number(r.avg_check),
      tipTotal: Number(r.tip_total),
      tipPercentage: r.tip_percentage != null ? Number(r.tip_percentage) : null,
      tablesTurned: Number(r.tables_turned),
      avgTurnTimeMinutes: r.avg_turn_time_minutes != null ? Number(r.avg_turn_time_minutes) : null,
      comps: Number(r.comps),
      voids: Number(r.voids),
    }));

    return { items };
  });
}
