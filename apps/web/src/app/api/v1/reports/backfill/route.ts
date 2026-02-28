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
 * rm_inventory_on_hand, rm_revenue_activity) from operational tables.
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
      await (tx as any).execute(sql`
        DELETE FROM rm_revenue_activity WHERE tenant_id = ${tenantId}
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

      // 4. Backfill rm_revenue_activity from orders
      // One row per order — source='pos_order', amounts in dollars
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_name, customer_id,
          employee_id, employee_name,
          amount_dollars, subtotal_dollars, tax_dollars,
          discount_dollars, service_charge_dollars,
          status, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          o.tenant_id,
          o.location_id,
          o.business_date,
          'pos_order',
          CASE WHEN o.tab_name IS NOT NULL OR o.table_number IS NOT NULL
            THEN 'pos_fnb' ELSE 'pos_retail' END,
          o.id,
          'Order #' || o.order_number,
          o.order_number,
          c.display_name,
          o.customer_id,
          o.employee_id,
          u.display_name,
          o.total / 100.0,
          o.subtotal / 100.0,
          o.tax_total / 100.0,
          o.discount_total / 100.0,
          o.service_charge_total / 100.0,
          CASE WHEN o.status = 'voided' THEN 'voided' ELSE 'completed' END,
          o.created_at,
          NOW()
        FROM orders o
        LEFT JOIN users u ON u.id = o.employee_id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.tenant_id = ${tenantId}
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
      `);

      // 4b. Backfill rm_revenue_activity — PMS folio charges
      // Folio entries use INTEGER cents; blacklist non-revenue types
      // pms_properties has NO location_id column — use '' consistent with consumer fallback
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_id, customer_name,
          amount_dollars, status, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          fe.tenant_id,
          '',
          COALESCE(fe.business_date, fe.posted_at::date),
          'pms_folio',
          LOWER(fe.entry_type),
          fe.id,
          'Folio #' || f.id,
          f.id,
          g.customer_id,
          g.last_name || ', ' || g.first_name,
          fe.amount_cents / 100.0,
          'completed',
          COALESCE(fe.posted_at, fe.created_at),
          NOW()
        FROM pms_folio_entries fe
        JOIN pms_folios f ON f.id = fe.folio_id AND f.tenant_id = fe.tenant_id
        LEFT JOIN pms_guests g ON g.id = f.guest_id AND g.tenant_id = fe.tenant_id
        WHERE fe.tenant_id = ${tenantId}
          AND UPPER(fe.entry_type) NOT IN (
            'PAYMENT', 'REFUND', 'CREDIT', 'ADJUSTMENT',
            'DEPOSIT', 'TRANSFER', 'WRITE_OFF', 'REVERSAL'
          )
        ON CONFLICT (tenant_id, source, source_id) DO NOTHING
      `);

      // 4c. Backfill rm_revenue_activity — AR invoices
      // AR invoices use NUMERIC(12,2) dollars — no cents conversion needed
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_id, customer_name,
          amount_dollars, status, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          i.tenant_id,
          COALESCE(i.location_id, ''),
          COALESCE(i.invoice_date, i.created_at::date),
          'ar_invoice',
          'ar_invoice',
          i.id,
          'Invoice #' || i.invoice_number,
          i.invoice_number,
          i.customer_id,
          c.display_name,
          i.total_amount,
          CASE
            WHEN i.status = 'voided' THEN 'voided'
            ELSE 'completed'
          END,
          COALESCE(i.posted_at, i.created_at),
          NOW()
        FROM ar_invoices i
        LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
        WHERE i.tenant_id = ${tenantId}
          AND i.status IN ('posted', 'partial', 'paid', 'voided')
        ON CONFLICT (tenant_id, source, source_id) DO NOTHING
      `);

      // 4d. Backfill rm_revenue_activity — standalone voucher purchases
      // Only vouchers NOT tied to a POS order (those are already counted in pos_order)
      // Voucher amounts are INTEGER cents
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_id,
          amount_dollars, status, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          v.tenant_id,
          '',
          v.created_at::date,
          'voucher',
          'voucher_purchased',
          v.id,
          'Voucher #' || v.voucher_number,
          v.voucher_number,
          v.customer_id,
          v.voucher_amount_cents / 100.0,
          'completed',
          v.created_at,
          NOW()
        FROM vouchers v
        WHERE v.tenant_id = ${tenantId}
          AND v.order_id IS NULL
          AND v.status != 'voided'
        ON CONFLICT (tenant_id, source, source_id) DO NOTHING
      `);

      // 4e. Backfill rm_revenue_activity — membership billing events
      // Amounts are INTEGER cents; need JOIN to customer_memberships for customer_id
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_id,
          amount_dollars, status, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          mbe.tenant_id,
          '',
          COALESCE(mbe.billing_period_start, mbe.created_at::date),
          'membership',
          mbe.event_type,
          mbe.id,
          'Membership Billing',
          cm.id,
          cm.customer_id,
          mbe.amount_cents / 100.0,
          'completed',
          mbe.created_at,
          NOW()
        FROM membership_billing_events mbe
        JOIN customer_memberships cm ON cm.id = mbe.membership_id AND cm.tenant_id = mbe.tenant_id
        WHERE mbe.tenant_id = ${tenantId}
          AND mbe.event_type IN ('charge', 'dues', 'assessment', 'initiation')
        ON CONFLICT (tenant_id, source, source_id) DO NOTHING
      `);

      // 4f. Backfill rm_revenue_activity — chargebacks
      // Chargebacks are NEGATIVE revenue; amounts are INTEGER cents
      // Status mapping: received/under_review → pending, won → reversed (amount 0), lost → completed
      await (tx as any).execute(sql`
        INSERT INTO rm_revenue_activity (
          id, tenant_id, location_id, business_date,
          source, source_sub_type, source_id, source_label,
          reference_number, customer_id,
          amount_dollars, status, metadata, occurred_at, created_at
        )
        SELECT
          gen_random_uuid()::text,
          cb.tenant_id,
          COALESCE(cb.location_id, ''),
          COALESCE(cb.business_date, cb.created_at::date),
          'chargeback',
          'chargeback_received',
          cb.id,
          'Chargeback #' || SUBSTRING(cb.id FROM LENGTH(cb.id) - 5),
          cb.order_id,
          cb.customer_id,
          CASE
            WHEN cb.status = 'won' THEN 0
            ELSE -(cb.chargeback_amount_cents / 100.0)
          END,
          CASE
            WHEN cb.status IN ('received', 'under_review') THEN 'pending'
            WHEN cb.status = 'won' THEN 'reversed'
            WHEN cb.status = 'lost' THEN 'completed'
            ELSE 'pending'
          END,
          jsonb_build_object(
            'tenderId', cb.tender_id,
            'feeAmountCents', COALESCE(cb.fee_amount_cents, 0),
            'resolution', CASE WHEN cb.status IN ('won', 'lost') THEN cb.status ELSE NULL END
          ),
          cb.created_at,
          NOW()
        FROM chargebacks cb
        WHERE cb.tenant_id = ${tenantId}
        ON CONFLICT (tenant_id, source, source_id) DO NOTHING
      `);

      // 4g. Aggregate non-POS revenue into rm_daily_sales
      // Uses INSERT ON CONFLICT to update existing POS rows or create new date rows
      await (tx as any).execute(sql`
        WITH non_pos_daily AS (
          SELECT
            tenant_id,
            COALESCE(NULLIF(location_id, ''), '__none__') AS loc_key,
            location_id,
            business_date,
            COALESCE(SUM(amount_dollars) FILTER (WHERE source = 'pms_folio'), 0) AS pms_rev,
            COALESCE(SUM(amount_dollars) FILTER (WHERE source = 'ar_invoice' AND status != 'voided'), 0) AS ar_rev,
            COALESCE(SUM(amount_dollars) FILTER (WHERE source = 'membership'), 0) AS mem_rev,
            COALESCE(SUM(amount_dollars) FILTER (WHERE source = 'voucher'), 0) AS vouch_rev
          FROM rm_revenue_activity
          WHERE tenant_id = ${tenantId}
            AND source IN ('pms_folio', 'ar_invoice', 'membership', 'voucher')
          GROUP BY tenant_id, location_id, business_date
        )
        INSERT INTO rm_daily_sales (
          id, tenant_id, location_id, business_date,
          order_count, gross_sales, discount_total, tax_total, net_sales,
          tender_cash, tender_card, tender_gift_card, tender_house_account,
          tender_ach, tender_other, tip_total, surcharge_total,
          void_count, void_total, avg_order_value,
          pms_revenue, ar_revenue, membership_revenue, voucher_revenue,
          total_business_revenue,
          updated_at
        )
        SELECT
          gen_random_uuid()::text,
          np.tenant_id,
          np.location_id,
          np.business_date,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0,
          np.pms_rev,
          np.ar_rev,
          np.mem_rev,
          np.vouch_rev,
          np.pms_rev + np.ar_rev + np.mem_rev + np.vouch_rev,
          NOW()
        FROM non_pos_daily np
        ON CONFLICT (tenant_id, location_id, business_date) DO UPDATE SET
          pms_revenue = EXCLUDED.pms_revenue,
          ar_revenue = EXCLUDED.ar_revenue,
          membership_revenue = EXCLUDED.membership_revenue,
          voucher_revenue = EXCLUDED.voucher_revenue,
          total_business_revenue = rm_daily_sales.net_sales
            + EXCLUDED.pms_revenue + EXCLUDED.ar_revenue
            + EXCLUDED.membership_revenue + EXCLUDED.voucher_revenue,
          updated_at = NOW()
      `);

      // 5. Backfill rm_inventory_on_hand from inventory_items + inventory_movements
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

      // 6. Count what was backfilled
      const [dailyCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_daily_sales WHERE tenant_id = ${tenantId}
      `);
      const [itemCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_item_sales WHERE tenant_id = ${tenantId}
      `);
      const [inventoryCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_inventory_on_hand WHERE tenant_id = ${tenantId}
      `);
      const [activityCount] = await (tx as any).execute(sql`
        SELECT count(*)::int AS cnt FROM rm_revenue_activity WHERE tenant_id = ${tenantId}
      `);

      return {
        dailySalesRows: (dailyCount as any)?.cnt ?? 0,
        itemSalesRows: (itemCount as any)?.cnt ?? 0,
        inventoryOnHandRows: (inventoryCount as any)?.cnt ?? 0,
        revenueActivityRows: (activityCount as any)?.cnt ?? 0,
      };
    });

    return NextResponse.json({
      data: {
        message: 'Read models backfilled successfully',
        ...result,
      },
    });
  },
  { entitlement: 'reporting', permission: 'reports.manage', writeAccess: true },
);
