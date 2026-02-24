import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import {
  computeModifierGroupHealth,
  type ModifierGroupHealthInput,
  type ModifierGroupHealthResult,
} from '../helpers/modifier-recommendations';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierGroupHealthInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  limit?: number;
}

export type { ModifierGroupHealthResult };

// ── Query ───────────────────────────────────────────────────────────

/**
 * Aggregates modifier group attach-rate data from `rm_modifier_group_attach`
 * and runs the recommendation engine to classify each group.
 *
 * Returns enriched results with attach rate, avg selections per check,
 * void rate, and an actionable recommendation label.
 */
export async function getModifierGroupHealth(
  input: GetModifierGroupHealthInput,
): Promise<ModifierGroupHealthResult[]> {
  const limit = Math.min(input.limit ?? 50, 500);

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
        bool_or(is_required) AS is_required,
        sum(eligible_line_count)::int AS eligible_line_count,
        sum(lines_with_selection)::int AS lines_with_selection,
        sum(total_modifier_selections)::int AS total_modifier_selections,
        max(unique_modifiers_selected)::int AS unique_modifiers_selected,
        sum(revenue_impact_dollars)::numeric(19,4) AS revenue_impact_dollars,
        sum(void_count)::int AS void_count,
        min(created_at) AS created_at
      FROM rm_modifier_group_attach
      WHERE ${whereClause}
      GROUP BY modifier_group_id
      ORDER BY sum(eligible_line_count) DESC
      LIMIT ${limit}
    `);

    const healthInputs: ModifierGroupHealthInput[] = Array.from(
      rows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      modifierGroupId: String(r.modifier_group_id),
      groupName: String(r.group_name ?? ''),
      isRequired: r.is_required === true,
      eligibleLineCount: Number(r.eligible_line_count) || 0,
      linesWithSelection: Number(r.lines_with_selection) || 0,
      totalSelections: Number(r.total_modifier_selections) || 0,
      uniqueModifiers: Number(r.unique_modifiers_selected) || 0,
      revenueImpactDollars: Number(r.revenue_impact_dollars) || 0,
      voidCount: Number(r.void_count) || 0,
      createdAt: r.created_at ? String(r.created_at) : undefined,
    }));

    return computeModifierGroupHealth(healthInputs);
  });
}
