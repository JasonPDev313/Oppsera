import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierDaypartHeatmapInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  modifierGroupId?: string;
  limit?: number;
}

export interface DaypartHeatmapRow {
  modifierId: string;
  modifierName: string;
  daypart: string;
  timesSelected: number;
  revenueDollars: number;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Aggregates modifier selections by modifier + daypart from `rm_modifier_daypart`.
 *
 * Returns a flat array suitable for heatmap rendering (modifier x daypart grid).
 */
export async function getModifierDaypartHeatmap(
  input: GetModifierDaypartHeatmapInput,
): Promise<DaypartHeatmapRow[]> {
  const limit = Math.min(input.limit ?? 500, 2000);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`business_date >= ${input.dateFrom}`,
      sql`business_date <= ${input.dateTo}`,
    ];

    if (input.locationId) {
      conditions.push(sql`location_id = ${input.locationId}`);
    }
    if (input.modifierGroupId) {
      conditions.push(sql`modifier_group_id = ${input.modifierGroupId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        modifier_id,
        (array_agg(modifier_name ORDER BY business_date DESC))[1] AS modifier_name,
        daypart,
        sum(times_selected)::int AS times_selected,
        sum(revenue_dollars)::numeric(19,4) AS revenue_dollars
      FROM rm_modifier_daypart
      WHERE ${whereClause}
      GROUP BY modifier_id, daypart
      ORDER BY modifier_id, daypart
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      modifierId: String(r.modifier_id),
      modifierName: String(r.modifier_name ?? ''),
      daypart: String(r.daypart),
      timesSelected: Number(r.times_selected) || 0,
      revenueDollars: Number(r.revenue_dollars) || 0,
    }));
  });
}
