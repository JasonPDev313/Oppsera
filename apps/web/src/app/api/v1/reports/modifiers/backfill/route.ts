import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

/**
 * POST /api/v1/reports/modifiers/backfill
 *
 * Rebuilds modifier reporting read models from operational order_lines data.
 *
 * This route reads the `modifiers` JSONB column on order_lines and cross-references
 * `catalog_item_modifier_groups` to reconstruct the 3 read model tables:
 *   - rm_modifier_item_sales
 *   - rm_modifier_daypart
 *   - rm_modifier_group_attach
 *
 * Safe to run multiple times — uses DELETE + INSERT (full rebuild).
 */
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const tenantId = ctx.tenantId;

    const result = await withTenant(tenantId, async (tx) => {
      // 1. Clear existing modifier read model data for this tenant
      await tx.execute(sql`DELETE FROM rm_modifier_item_sales WHERE tenant_id = ${tenantId}`);
      await tx.execute(sql`DELETE FROM rm_modifier_daypart WHERE tenant_id = ${tenantId}`);
      await tx.execute(sql`DELETE FROM rm_modifier_group_attach WHERE tenant_id = ${tenantId}`);

      // 2. Backfill rm_modifier_item_sales from order_lines.modifiers JSONB
      //    order_lines stores modifiers as jsonb: [{modifierId, modifierGroupId?, name, priceAdjustment, isDefault, instruction?}]
      //    priceAdjustment is in cents (INTEGER) — divide by 100 for dollars.
      await tx.execute(sql`
        INSERT INTO rm_modifier_item_sales (
          id, tenant_id, location_id, business_date,
          modifier_id, modifier_group_id, catalog_item_id,
          modifier_name, group_name, catalog_item_name,
          times_selected, revenue_dollars, extra_revenue_dollars,
          instruction_none, instruction_extra, instruction_on_side, instruction_default,
          void_count, void_revenue_dollars,
          created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          ol.tenant_id,
          o.location_id,
          o.business_date,
          m->>'modifierId',
          coalesce(m->>'modifierGroupId', 'unknown'),
          ol.catalog_item_id,
          m->>'name',
          null,
          ol.catalog_item_name,
          sum(CASE WHEN o.status IN ('placed', 'paid') THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') THEN (coalesce((m->>'priceAdjustment')::numeric, 0) * ol.qty::numeric) / 100.0 ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') AND (m->>'instruction') = 'extra' THEN (coalesce((m->>'priceAdjustment')::numeric, 0) * ol.qty::numeric) / 100.0 ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') AND coalesce(m->>'instruction', '') = 'none' THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') AND (m->>'instruction') = 'extra' THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') AND (m->>'instruction') = 'on_side' THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') AND coalesce(m->>'isDefault', 'false') = 'true' THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status = 'voided' THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status = 'voided' THEN (coalesce((m->>'priceAdjustment')::numeric, 0) * ol.qty::numeric) / 100.0 ELSE 0 END),
          now(), now()
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        CROSS JOIN LATERAL jsonb_array_elements(ol.modifiers) AS m
        WHERE ol.tenant_id = ${tenantId}
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
          AND ol.modifiers IS NOT NULL
          AND jsonb_array_length(ol.modifiers) > 0
        GROUP BY
          ol.tenant_id, o.location_id, o.business_date,
          m->>'modifierId', coalesce(m->>'modifierGroupId', 'unknown'),
          ol.catalog_item_id, m->>'name', ol.catalog_item_name
      `);

      // 3. Backfill rm_modifier_daypart from order_lines.modifiers JSONB
      //    Daypart derived from order created_at hour.
      await tx.execute(sql`
        INSERT INTO rm_modifier_daypart (
          id, tenant_id, location_id, business_date,
          modifier_id, modifier_group_id, daypart,
          modifier_name, group_name,
          times_selected, revenue_dollars,
          created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          ol.tenant_id,
          o.location_id,
          o.business_date,
          m->>'modifierId',
          coalesce(m->>'modifierGroupId', 'unknown'),
          CASE
            WHEN extract(hour from o.created_at) < 11 THEN 'breakfast'
            WHEN extract(hour from o.created_at) < 15 THEN 'lunch'
            WHEN extract(hour from o.created_at) < 17 THEN 'afternoon'
            WHEN extract(hour from o.created_at) < 21 THEN 'dinner'
            ELSE 'late_night'
          END,
          m->>'name',
          null,
          sum(CASE WHEN o.status IN ('placed', 'paid') THEN ol.qty::int ELSE 0 END),
          sum(CASE WHEN o.status IN ('placed', 'paid') THEN (coalesce((m->>'priceAdjustment')::numeric, 0) * ol.qty::numeric) / 100.0 ELSE 0 END),
          now(), now()
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        CROSS JOIN LATERAL jsonb_array_elements(ol.modifiers) AS m
        WHERE ol.tenant_id = ${tenantId}
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
          AND ol.modifiers IS NOT NULL
          AND jsonb_array_length(ol.modifiers) > 0
        GROUP BY
          ol.tenant_id, o.location_id, o.business_date,
          m->>'modifierId', coalesce(m->>'modifierGroupId', 'unknown'),
          CASE
            WHEN extract(hour from o.created_at) < 11 THEN 'breakfast'
            WHEN extract(hour from o.created_at) < 15 THEN 'lunch'
            WHEN extract(hour from o.created_at) < 17 THEN 'afternoon'
            WHEN extract(hour from o.created_at) < 21 THEN 'dinner'
            ELSE 'late_night'
          END,
          m->>'name'
      `);

      // 4. Backfill rm_modifier_group_attach from catalog_item_modifier_groups + order_lines
      //    Eligible = order lines where item has modifier groups assigned.
      //    Selected = order lines where at least one modifier from that group was chosen.
      await tx.execute(sql`
        INSERT INTO rm_modifier_group_attach (
          id, tenant_id, location_id, business_date,
          modifier_group_id, group_name, is_required,
          eligible_line_count, lines_with_selection,
          total_modifier_selections, unique_modifiers_selected,
          revenue_impact_dollars, void_count,
          created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          ol.tenant_id,
          o.location_id,
          o.business_date,
          cimg.modifier_group_id,
          cmg.name,
          coalesce(cmg.is_required, false),
          sum(ol.qty::int)::int,
          sum(CASE WHEN sel.selection_count > 0 THEN ol.qty::int ELSE 0 END)::int,
          sum(coalesce(sel.selection_count, 0) * ol.qty::int)::int,
          0,
          sum(CASE WHEN sel.total_revenue IS NOT NULL THEN sel.total_revenue * ol.qty::numeric / 100.0 ELSE 0 END),
          sum(CASE WHEN o.status = 'voided' THEN ol.qty::int ELSE 0 END)::int,
          now(), now()
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        JOIN catalog_item_modifier_groups cimg ON cimg.catalog_item_id = ol.catalog_item_id AND cimg.tenant_id = ol.tenant_id
        LEFT JOIN catalog_modifier_groups cmg ON cmg.id = cimg.modifier_group_id
        LEFT JOIN LATERAL (
          SELECT
            count(*)::int AS selection_count,
            sum(coalesce((m->>'priceAdjustment')::numeric, 0)) AS total_revenue
          FROM jsonb_array_elements(ol.modifiers) AS m
          WHERE coalesce(m->>'modifierGroupId', 'unknown') = cimg.modifier_group_id
        ) sel ON true
        WHERE ol.tenant_id = ${tenantId}
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
        GROUP BY
          ol.tenant_id, o.location_id, o.business_date,
          cimg.modifier_group_id, cmg.name, cmg.is_required
      `);

      // 5. Count what was backfilled
      const itemSalesCount = await tx.execute(sql`
        SELECT count(*)::int AS cnt FROM rm_modifier_item_sales WHERE tenant_id = ${tenantId}
      `);
      const daypartCount = await tx.execute(sql`
        SELECT count(*)::int AS cnt FROM rm_modifier_daypart WHERE tenant_id = ${tenantId}
      `);
      const groupAttachCount = await tx.execute(sql`
        SELECT count(*)::int AS cnt FROM rm_modifier_group_attach WHERE tenant_id = ${tenantId}
      `);

      const rows1 = Array.from(itemSalesCount as Iterable<Record<string, unknown>>);
      const rows2 = Array.from(daypartCount as Iterable<Record<string, unknown>>);
      const rows3 = Array.from(groupAttachCount as Iterable<Record<string, unknown>>);

      return {
        modifierItemSalesRows: Number(rows1[0]?.cnt) || 0,
        modifierDaypartRows: Number(rows2[0]?.cnt) || 0,
        modifierGroupAttachRows: Number(rows3[0]?.cnt) || 0,
      };
    });

    return NextResponse.json({
      data: {
        message: 'Modifier reporting read models backfilled successfully',
        ...result,
      },
    });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
