import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierGroupItemHeatmapInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  limit?: number;
}

export interface GroupItemHeatmapRow {
  modifierGroupId: string;
  groupName: string;
  catalogItemId: string;
  catalogItemName: string;
  timesSelected: number;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Aggregates modifier selections by group + catalog item from `rm_modifier_item_sales`.
 *
 * Returns a flat array suitable for heatmap rendering (group x item grid).
 */
export async function getModifierGroupItemHeatmap(
  input: GetModifierGroupItemHeatmapInput,
): Promise<GroupItemHeatmapRow[]> {
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

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        modifier_group_id,
        (array_agg(group_name ORDER BY business_date DESC))[1] AS group_name,
        catalog_item_id,
        (array_agg(catalog_item_name ORDER BY business_date DESC))[1] AS catalog_item_name,
        sum(times_selected)::int AS times_selected
      FROM rm_modifier_item_sales
      WHERE ${whereClause}
      GROUP BY modifier_group_id, catalog_item_id
      ORDER BY sum(times_selected) DESC
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      modifierGroupId: String(r.modifier_group_id),
      groupName: String(r.group_name ?? ''),
      catalogItemId: String(r.catalog_item_id),
      catalogItemName: String(r.catalog_item_name ?? ''),
      timesSelected: Number(r.times_selected) || 0,
    }));
  });
}
