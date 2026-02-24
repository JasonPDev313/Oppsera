import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierPerformanceInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  modifierGroupId?: string;
  catalogItemId?: string;
  sortBy?: 'timesSelected' | 'revenue';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface ModifierPerformanceRow {
  modifierId: string;
  modifierName: string;
  modifierGroupId: string;
  groupName: string;
  timesSelected: number;
  revenueDollars: number;
  extraRevenueDollars: number;
  instructionNone: number;
  instructionExtra: number;
  instructionOnSide: number;
  instructionDefault: number;
  voidCount: number;
  voidRevenueDollars: number;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Aggregates modifier performance from `rm_modifier_item_sales` by modifier.
 *
 * Sums selection counts, revenue, instruction breakdowns, and void metrics
 * across the date range. Supports optional location, group, and item filters.
 */
export async function getModifierPerformance(
  input: GetModifierPerformanceInput,
): Promise<ModifierPerformanceRow[]> {
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
    if (input.modifierGroupId) {
      conditions.push(sql`modifier_group_id = ${input.modifierGroupId}`);
    }
    if (input.catalogItemId) {
      conditions.push(sql`catalog_item_id = ${input.catalogItemId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const orderCol =
      input.sortBy === 'revenue'
        ? sql`sum(revenue_dollars)`
        : sql`sum(times_selected)`;
    const orderDir = input.sortDir === 'asc' ? sql`ASC` : sql`DESC`;

    const rows = await tx.execute(sql`
      SELECT
        modifier_id,
        modifier_group_id,
        (array_agg(modifier_name ORDER BY business_date DESC))[1] AS modifier_name,
        (array_agg(group_name ORDER BY business_date DESC))[1] AS group_name,
        sum(times_selected)::int AS times_selected,
        sum(revenue_dollars)::numeric(19,4) AS revenue_dollars,
        sum(extra_revenue_dollars)::numeric(19,4) AS extra_revenue_dollars,
        sum(instruction_none)::int AS instruction_none,
        sum(instruction_extra)::int AS instruction_extra,
        sum(instruction_on_side)::int AS instruction_on_side,
        sum(instruction_default)::int AS instruction_default,
        sum(void_count)::int AS void_count,
        sum(void_revenue_dollars)::numeric(19,4) AS void_revenue_dollars
      FROM rm_modifier_item_sales
      WHERE ${whereClause}
      GROUP BY modifier_id, modifier_group_id
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      modifierId: String(r.modifier_id),
      modifierName: String(r.modifier_name ?? ''),
      modifierGroupId: String(r.modifier_group_id),
      groupName: String(r.group_name ?? ''),
      timesSelected: Number(r.times_selected) || 0,
      revenueDollars: Number(r.revenue_dollars) || 0,
      extraRevenueDollars: Number(r.extra_revenue_dollars) || 0,
      instructionNone: Number(r.instruction_none) || 0,
      instructionExtra: Number(r.instruction_extra) || 0,
      instructionOnSide: Number(r.instruction_on_side) || 0,
      instructionDefault: Number(r.instruction_default) || 0,
      voidCount: Number(r.void_count) || 0,
      voidRevenueDollars: Number(r.void_revenue_dollars) || 0,
    }));
  });
}
