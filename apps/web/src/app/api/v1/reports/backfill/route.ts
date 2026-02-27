import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
// generateUlid removed — not used in this route

/**
 * POST /api/v1/reports/backfill
 *
 * One-time backfill of reporting read models (rm_daily_sales, rm_item_sales,
 * rm_inventory_on_hand) from operational tables.
 *
 * Use this when data was created directly (e.g., seed data) without going
 * through the event system, so the CQRS read models are empty.
 *
 * Safe to run multiple times — uses DELETE + INSERT (full rebuild).
 */
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const tenantId = ctx.tenantId;

    const result = await withTenant(tenantId, async (tx) => {
      // 1. Clear existing read model data for this tenant
      await (tx as any).execute(sql`
        DELETE FROM rm_daily_sales WHERE tenant_id = ${tenantId}
      `);
      await (tx as any).execute(sql`
        DELETE FROM rm_item_sales WHERE tenant_id = ${tenantId}
      `);
      await (tx as any).execute(sql`
        DELETE FROM rm_inventory_on_hand WHERE tenant_id = ${tenantId}
      `);

      // 2. Backfill rm_daily_sales from orders + tenders
      // Orders amounts are INTEGER (cents) — divide by 100 for NUMERIC dollars
      await (tx as any).execute(sql`
        WITH order_agg AS (
          SELECT
            tenant_id,
            location_id,
            business_date,
            count(*) FILTER (WHERE status IN ('placed', 'paid'))::int AS order_count,
            coalesce(sum(subtotal) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS gross_sales,
            coalesce(sum(discount_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS discount_total,
            coalesce(sum(tax_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS tax_total,
            coalesce(sum(total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS net_sales,
            count(*) FILTER (WHERE status = 'voided')::int AS void_count,
            coalesce(sum(total) FILTER (WHERE status = 'voided'), 0) / 100.0 AS void_total
          FROM orders
          WHERE tenant_id = ${tenantId}
            AND status IN ('placed', 'paid', 'voided')
            AND business_date IS NOT NULL
          GROUP BY tenant_id, location_id, business_date
        ),
        tender_agg AS (
          SELECT
            t.tenant_id,
            o.location_id,
            o.business_date,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'cash' AND t.status = 'captured'), 0) / 100.0 AS tender_cash,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'card' AND t.status = 'captured'), 0) / 100.0 AS tender_card,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'gift_card' AND t.status = 'captured'), 0) / 100.0 AS tender_gift_card,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'house_account' AND t.status = 'captured'), 0) / 100.0 AS tender_house_account,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'ach' AND t.status = 'captured'), 0) / 100.0 AS tender_ach,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type NOT IN ('cash', 'card', 'gift_card', 'house_account', 'ach') AND t.status = 'captured'), 0) / 100.0 AS tender_other,
            coalesce(sum(t.tip_amount) FILTER (WHERE t.status = 'captured'), 0) / 100.0 AS tip_total,
            coalesce(sum(coalesce(t.surcharge_amount_cents, 0)) FILTER (WHERE t.status = 'captured'), 0) / 100.0 AS surcharge_total
          FROM tenders t
          JOIN orders o ON o.id = t.order_id
          WHERE t.tenant_id = ${tenantId}
            AND t.status = 'captured'
            AND o.business_date IS NOT NULL
          GROUP BY t.tenant_id, o.location_id, o.business_date
        )
        INSERT INTO rm_daily_sales (
          id, tenant_id, location_id, business_date,
          order_count, gross_sales, discount_total, tax_total, net_sales,
          tender_cash, tender_card, tender_gift_card, tender_house_account,
          tender_ach, tender_other, tip_total, surcharge_total,
          void_count, void_total, avg_order_value,
          updated_at
        )
        SELECT
          gen_random_uuid()::text,
          oa.tenant_id,
          oa.location_id,
          oa.business_date,
          oa.order_count,
          oa.gross_sales,
          oa.discount_total,
          oa.tax_total,
          oa.net_sales,
          coalesce(ta.tender_cash, 0),
          coalesce(ta.tender_card, 0),
          coalesce(ta.tender_gift_card, 0),
          coalesce(ta.tender_house_account, 0),
          coalesce(ta.tender_ach, 0),
          coalesce(ta.tender_other, 0),
          coalesce(ta.tip_total, 0),
          coalesce(ta.surcharge_total, 0),
          oa.void_count,
          oa.void_total,
          CASE WHEN oa.order_count > 0
            THEN oa.net_sales / oa.order_count
            ELSE 0
          END,
          NOW()
        FROM order_agg oa
        LEFT JOIN tender_agg ta
          ON ta.tenant_id = oa.tenant_id
          AND ta.location_id = oa.location_id
          AND ta.business_date = oa.business_date
      `);

      // 3. Backfill rm_item_sales from order_lines
      await (tx as any).execute(sql`
        INSERT INTO rm_item_sales (
          id, tenant_id, location_id, business_date,
          catalog_item_id, catalog_item_name,
          quantity_sold, gross_revenue,
          quantity_voided, void_revenue,
          updated_at
        )
        SELECT
          gen_random_uuid()::text,
          ol.tenant_id,
          o.location_id,
          o.business_date,
          ol.catalog_item_id,
          max(ol.catalog_item_name),
          coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status IN ('placed', 'paid')), 0),
          coalesce(sum(ol.line_total) FILTER (WHERE o.status IN ('placed', 'paid')), 0) / 100.0,
          coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status = 'voided'), 0),
          coalesce(sum(ol.line_total) FILTER (WHERE o.status = 'voided'), 0) / 100.0,
          NOW()
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE ol.tenant_id = ${tenantId}
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
        GROUP BY ol.tenant_id, o.location_id, o.business_date, ol.catalog_item_id
      `);

      // 4. Backfill rm_inventory_on_hand from inventory_items + inventory_movements
      // on_hand = SUM(quantity_delta) from inventory_movements (gotcha #18)
      // low_stock_threshold from inventory_items.reorder_point
      await (tx as any).execute(sql`
        INSERT INTO rm_inventory_on_hand (
          id, tenant_id, location_id, inventory_item_id, item_name,
          on_hand, low_stock_threshold, is_below_threshold,
          updated_at
        )
        SELECT
          gen_random_uuid()::text,
          ii.tenant_id,
          ii.location_id,
          ii.id,
          ii.name,
          coalesce(mv.total_on_hand, 0)::int,
          coalesce(ii.reorder_point, '0')::int,
          coalesce(mv.total_on_hand, 0) < coalesce(ii.reorder_point::numeric, 0),
          NOW()
        FROM inventory_items ii
        LEFT JOIN (
          SELECT
            inventory_item_id,
            SUM(quantity_delta) AS total_on_hand
          FROM inventory_movements
          WHERE tenant_id = ${tenantId}
          GROUP BY inventory_item_id
        ) mv ON mv.inventory_item_id = ii.id
        WHERE ii.tenant_id = ${tenantId}
          AND ii.status = 'active'
          AND ii.track_inventory = true
      `);

      // 5. Count what was backfilled
      const [dailyCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_daily_sales WHERE tenant_id = ${tenantId}
      `);
      const [itemCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_item_sales WHERE tenant_id = ${tenantId}
      `);
      const [inventoryCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_inventory_on_hand WHERE tenant_id = ${tenantId}
      `);

      return {
        dailySalesRows: (dailyCount as any)?.cnt ?? 0,
        itemSalesRows: (itemCount as any)?.cnt ?? 0,
        inventoryOnHandRows: (inventoryCount as any)?.cnt ?? 0,
      };
    });

    return NextResponse.json({
      data: {
        message: 'Read models backfilled successfully',
        ...result,
      },
    });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
