import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierWasteSignalsInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  modifierGroupId?: string;
  limit?: number;
}

export interface WasteSignalRow {
  modifierId: string;
  modifierName: string;
  groupName: string;
  timesSelected: number;
  voidCount: number;
  voidRate: number;
  voidRevenueDollars: number;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Surfaces modifiers with waste signals from `rm_modifier_item_sales`.
 *
 * Only returns modifiers that have at least one void.
 * Sorted by void rate (worst first) to highlight the biggest waste contributors.
 */
export async function getModifierWasteSignals(
  input: GetModifierWasteSignalsInput,
): Promise<WasteSignalRow[]> {
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
    if (input.modifierGroupId) {
      conditions.push(sql`modifier_group_id = ${input.modifierGroupId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        modifier_id,
        (array_agg(modifier_name ORDER BY business_date DESC))[1] AS modifier_name,
        (array_agg(group_name ORDER BY business_date DESC))[1] AS group_name,
        sum(times_selected)::int AS times_selected,
        sum(void_count)::int AS void_count,
        sum(void_revenue_dollars)::numeric(19,4) AS void_revenue_dollars
      FROM rm_modifier_item_sales
      WHERE ${whereClause}
      GROUP BY modifier_id
      HAVING sum(void_count) > 0
      ORDER BY
        CASE WHEN sum(times_selected) > 0
          THEN sum(void_count)::numeric / sum(times_selected)
          ELSE 0
        END DESC
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const timesSelected = Number(r.times_selected) || 0;
      const voidCount = Number(r.void_count) || 0;

      return {
        modifierId: String(r.modifier_id),
        modifierName: String(r.modifier_name ?? ''),
        groupName: String(r.group_name ?? ''),
        timesSelected,
        voidCount,
        voidRate: timesSelected > 0 ? voidCount / timesSelected : 0,
        voidRevenueDollars: Number(r.void_revenue_dollars) || 0,
      };
    });
  });
}
