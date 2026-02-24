import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierLocationHeatmapInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  modifierGroupId?: string;
  limit?: number;
}

export interface LocationHeatmapRow {
  locationId: string;
  locationName: string;
  modifierGroupId: string;
  groupName: string;
  eligibleLineCount: number;
  linesWithSelection: number;
  attachRate: number;
  revenueImpactDollars: number;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Aggregates modifier group attach data by location + group
 * from `rm_modifier_group_attach`, joined with `locations` for display names.
 *
 * Returns a flat array suitable for heatmap rendering (location x group grid).
 * Attach rate is computed inline: linesWithSelection / eligibleLineCount.
 */
export async function getModifierLocationHeatmap(
  input: GetModifierLocationHeatmapInput,
): Promise<LocationHeatmapRow[]> {
  const limit = Math.min(input.limit ?? 500, 2000);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`mga.tenant_id = ${input.tenantId}`,
      sql`mga.business_date >= ${input.dateFrom}`,
      sql`mga.business_date <= ${input.dateTo}`,
    ];

    if (input.modifierGroupId) {
      conditions.push(sql`mga.modifier_group_id = ${input.modifierGroupId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        mga.location_id,
        l.name AS location_name,
        mga.modifier_group_id,
        (array_agg(mga.group_name ORDER BY mga.business_date DESC))[1] AS group_name,
        sum(mga.eligible_line_count)::int AS eligible_line_count,
        sum(mga.lines_with_selection)::int AS lines_with_selection,
        sum(mga.revenue_impact_dollars)::numeric(19,4) AS revenue_impact_dollars
      FROM rm_modifier_group_attach mga
      JOIN locations l ON l.id = mga.location_id
      WHERE ${whereClause}
      GROUP BY mga.location_id, l.name, mga.modifier_group_id
      ORDER BY mga.location_id, mga.modifier_group_id
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const eligible = Number(r.eligible_line_count) || 0;
      const withSelection = Number(r.lines_with_selection) || 0;

      return {
        locationId: String(r.location_id),
        locationName: String(r.location_name ?? ''),
        modifierGroupId: String(r.modifier_group_id),
        groupName: String(r.group_name ?? ''),
        eligibleLineCount: eligible,
        linesWithSelection: withSelection,
        attachRate: eligible > 0 ? withSelection / eligible : 0,
        revenueImpactDollars: Number(r.revenue_impact_dollars) || 0,
      };
    });
  });
}
