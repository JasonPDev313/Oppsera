import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierComplexityInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  limit?: number;
}

export interface ComplexityRow {
  catalogItemId: string;
  catalogItemName: string;
  distinctModifiers: number;
  distinctGroups: number;
  totalSelections: number;
  avgModifiersPerOrder: number;
  complexityScore: number;
}

// ── Constants ───────────────────────────────────────────────────────

const WEIGHT_DISTINCT_MODIFIERS = 0.4;
const WEIGHT_AVG_PER_ORDER = 0.3;
const WEIGHT_DISTINCT_GROUPS = 0.3;

// ── Query ───────────────────────────────────────────────────────────

/**
 * Computes a per-item modifier complexity score from `rm_modifier_item_sales`.
 *
 * Complexity = distinctModifiers * 0.4 + avgModifiersPerOrder * 0.3 + distinctGroups * 0.3
 *
 * Higher scores indicate items that are harder to prepare / more error-prone
 * due to a large number of possible modifier combinations.
 * Sorted by complexity score descending.
 */
export async function getModifierComplexity(
  input: GetModifierComplexityInput,
): Promise<ComplexityRow[]> {
  const limit = Math.min(input.limit ?? 100, 500);

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
        catalog_item_id,
        (array_agg(catalog_item_name ORDER BY business_date DESC))[1] AS catalog_item_name,
        count(DISTINCT modifier_id)::int AS distinct_modifiers,
        count(DISTINCT modifier_group_id)::int AS distinct_groups,
        sum(times_selected)::int AS total_selections
      FROM rm_modifier_item_sales
      WHERE ${whereClause}
      GROUP BY catalog_item_id
      ORDER BY catalog_item_id
    `);

    const mapped = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const distinctModifiers = Number(r.distinct_modifiers) || 0;
      const distinctGroups = Number(r.distinct_groups) || 0;
      const totalSelections = Number(r.total_selections) || 0;

      // avgModifiersPerOrder: average distinct modifier selections per eligible line.
      // Since the read model is pre-aggregated by modifier+item+date, we approximate
      // using totalSelections / distinctModifiers (how many times each modifier is used
      // on average), bounded to a minimum of 1.
      const avgModifiersPerOrder =
        distinctModifiers > 0 ? totalSelections / distinctModifiers : 0;

      const complexityScore =
        distinctModifiers * WEIGHT_DISTINCT_MODIFIERS +
        avgModifiersPerOrder * WEIGHT_AVG_PER_ORDER +
        distinctGroups * WEIGHT_DISTINCT_GROUPS;

      return {
        catalogItemId: String(r.catalog_item_id),
        catalogItemName: String(r.catalog_item_name ?? ''),
        distinctModifiers,
        distinctGroups,
        totalSelections,
        avgModifiersPerOrder: Math.round(avgModifiersPerOrder * 100) / 100,
        complexityScore: Math.round(complexityScore * 100) / 100,
      };
    });

    // Sort by complexityScore DESC in JS (computed column, not available in SQL)
    mapped.sort((a, b) => b.complexityScore - a.complexityScore);

    return mapped.slice(0, limit);
  });
}
