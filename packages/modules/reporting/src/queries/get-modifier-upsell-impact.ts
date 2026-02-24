import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface GetModifierUpsellImpactInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  modifierGroupId?: string;
  sortBy?: 'revenue' | 'margin';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface UpsellImpactRow {
  modifierId: string;
  modifierName: string;
  groupName: string;
  timesSelected: number;
  revenueDollars: number;
  costDollars: number | null;
  marginDollars: number | null;
  marginPercent: number | null;
}

// ── Query ───────────────────────────────────────────────────────────

/**
 * Computes upsell impact per modifier by joining `rm_modifier_item_sales`
 * with `catalog_modifiers` for cost data.
 *
 * Margin = revenue - (timesSelected * unit cost).
 * Only returns modifiers with revenue > 0.
 */
export async function getModifierUpsellImpact(
  input: GetModifierUpsellImpactInput,
): Promise<UpsellImpactRow[]> {
  const limit = Math.min(input.limit ?? 100, 500);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`rms.tenant_id = ${input.tenantId}`,
      sql`rms.business_date >= ${input.dateFrom}`,
      sql`rms.business_date <= ${input.dateTo}`,
    ];

    if (input.locationId) {
      conditions.push(sql`rms.location_id = ${input.locationId}`);
    }
    if (input.modifierGroupId) {
      conditions.push(sql`rms.modifier_group_id = ${input.modifierGroupId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const orderCol =
      input.sortBy === 'margin'
        ? sql`margin_dollars`
        : sql`revenue_dollars`;
    const orderDir = input.sortDir === 'asc' ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`;

    const rows = await tx.execute(sql`
      SELECT
        rms.modifier_id,
        (array_agg(rms.modifier_name ORDER BY rms.business_date DESC))[1] AS modifier_name,
        (array_agg(rms.group_name ORDER BY rms.business_date DESC))[1] AS group_name,
        sum(rms.times_selected)::int AS times_selected,
        sum(rms.revenue_dollars)::numeric(19,4) AS revenue_dollars,
        cm.cost AS unit_cost,
        CASE
          WHEN cm.cost IS NOT NULL THEN
            (sum(rms.revenue_dollars) - sum(rms.times_selected) * cm.cost)::numeric(19,4)
          ELSE NULL
        END AS margin_dollars,
        CASE
          WHEN cm.cost IS NOT NULL AND sum(rms.revenue_dollars) > 0 THEN
            ((sum(rms.revenue_dollars) - sum(rms.times_selected) * cm.cost) / sum(rms.revenue_dollars) * 100)::numeric(10,2)
          ELSE NULL
        END AS margin_percent
      FROM rm_modifier_item_sales rms
      LEFT JOIN catalog_modifiers cm ON cm.id = rms.modifier_id
      WHERE ${whereClause}
      GROUP BY rms.modifier_id, cm.cost
      HAVING sum(rms.revenue_dollars) > 0
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ${limit}
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
      const timesSelected = Number(r.times_selected) || 0;

      return {
        modifierId: String(r.modifier_id),
        modifierName: String(r.modifier_name ?? ''),
        groupName: String(r.group_name ?? ''),
        timesSelected,
        revenueDollars: Number(r.revenue_dollars) || 0,
        costDollars: unitCost != null ? unitCost * timesSelected : null,
        marginDollars: r.margin_dollars != null ? Number(r.margin_dollars) : null,
        marginPercent: r.margin_percent != null ? Number(r.margin_percent) : null,
      };
    });
  });
}
