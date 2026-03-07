/**
 * POST /api/v1/internal/backfill-read-models
 *
 * Force-backfill POS-derived reporting read models (rm_daily_sales, rm_item_sales,
 * rm_revenue_activity) for a specific tenant from orders/tenders tables.
 *
 * WARNING: This only rebuilds POS revenue data. Non-POS revenue (PMS, AR,
 * membership, voucher, spa) in rm_daily_sales will be wiped by the DELETE and
 * NOT reconstructed. Those aggregates will be repopulated as new live events
 * arrive. Use with caution for tenants with significant non-POS revenue.
 *
 * Also fixes NULL business_date on orders (uses created_at::date).
 *
 * Body: { tenantId: string }
 * Auth: CRON_SECRET bearer token (same as drain-outbox)
 */

import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tenantId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tenantId = body.tenantId;
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const results: Record<string, unknown> = { tenantId };

  try {
    // 1. Clear the in-memory backfill cache for this tenant (if semantic module is loaded)
    try {
      const { clearBackfillCache } = await import('@oppsera/module-semantic/llm');
      clearBackfillCache(tenantId);
      results.cacheCleared = true;
    } catch {
      results.cacheCleared = false;
    }

    // 2. Fix NULL business_date on orders
    const fixedDates = await db.execute(sql`
      UPDATE orders
      SET business_date = created_at::date::text
      WHERE tenant_id = ${tenantId}
        AND status IN ('placed', 'paid', 'voided')
        AND business_date IS NULL
    `) as unknown as { count: number };
    results.nullBusinessDatesFixed = fixedDates.count ?? 0;

    // 3. Count existing orders
    const orderCount = await db.execute(sql`
      SELECT count(*)::int AS cnt
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND status IN ('placed', 'paid')
    `) as unknown as Array<{ cnt: number }>;
    results.orderCount = Number(orderCount[0]?.cnt ?? 0);

    if (results.orderCount === 0) {
      return NextResponse.json({ ...results, status: 'no_orders', message: 'No placed/paid orders for this tenant' });
    }

    // 4. Delete and rebuild rm_daily_sales
    await db.execute(sql`DELETE FROM rm_daily_sales WHERE tenant_id = ${tenantId}`);

    const dailyInserted = await db.execute(sql`
      WITH order_agg AS (
        SELECT
          tenant_id, location_id, business_date,
          count(*) FILTER (WHERE status IN ('placed', 'paid'))::int AS order_count,
          coalesce(sum(subtotal) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS gross_sales,
          coalesce(sum(discount_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS discount_total,
          coalesce(sum(tax_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS tax_total,
          coalesce(sum(total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS net_sales,
          coalesce(sum(service_charge_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS service_charge_total,
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
          t.tenant_id, o.location_id, o.business_date,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'cash' AND t.status = 'captured'), 0) / 100.0 AS tender_cash,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type IN ('card', 'credit_card', 'debit_card') AND t.status = 'captured'), 0) / 100.0 AS tender_card,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'gift_card' AND t.status = 'captured'), 0) / 100.0 AS tender_gift_card,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'house_account' AND t.status = 'captured'), 0) / 100.0 AS tender_house_account,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'ach' AND t.status = 'captured'), 0) / 100.0 AS tender_ach,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type NOT IN ('cash', 'card', 'credit_card', 'debit_card', 'gift_card', 'house_account', 'ach') AND t.status = 'captured'), 0) / 100.0 AS tender_other,
          coalesce(sum(t.tip_amount) FILTER (WHERE t.status = 'captured'), 0) / 100.0 AS tip_total,
          coalesce(sum(t.surcharge_amount_cents) FILTER (WHERE t.status = 'captured'), 0) / 100.0 AS surcharge_total
        FROM tenders t
        JOIN orders o ON o.id = t.order_id
        WHERE t.tenant_id = ${tenantId} AND t.status = 'captured' AND o.business_date IS NOT NULL
        GROUP BY t.tenant_id, o.location_id, o.business_date
      )
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        order_count, gross_sales, discount_total, tax_total, net_sales,
        service_charge_total, tender_cash, tender_card, tender_gift_card,
        tender_house_account, tender_ach, tender_other,
        tip_total, surcharge_total,
        void_count, void_total, avg_order_value,
        total_business_revenue, updated_at
      )
      SELECT
        gen_random_uuid()::text, oa.tenant_id, oa.location_id, oa.business_date,
        oa.order_count, oa.gross_sales, oa.discount_total, oa.tax_total, oa.net_sales,
        oa.service_charge_total,
        coalesce(ta.tender_cash, 0), coalesce(ta.tender_card, 0), coalesce(ta.tender_gift_card, 0),
        coalesce(ta.tender_house_account, 0), coalesce(ta.tender_ach, 0), coalesce(ta.tender_other, 0),
        coalesce(ta.tip_total, 0), coalesce(ta.surcharge_total, 0),
        oa.void_count, oa.void_total,
        CASE WHEN oa.order_count > 0 THEN oa.net_sales / oa.order_count ELSE 0 END,
        oa.net_sales,
        NOW()
      FROM order_agg oa
      LEFT JOIN tender_agg ta
        ON ta.tenant_id = oa.tenant_id
        AND ta.location_id = oa.location_id
        AND ta.business_date = oa.business_date
    `) as unknown as { count: number };
    results.rmDailySalesInserted = dailyInserted.count ?? 0;

    // 5. Delete and rebuild rm_item_sales
    await db.execute(sql`DELETE FROM rm_item_sales WHERE tenant_id = ${tenantId}`);

    const itemInserted = await db.execute(sql`
      INSERT INTO rm_item_sales (
        id, tenant_id, location_id, business_date,
        catalog_item_id, catalog_item_name, category_name,
        quantity_sold, gross_revenue, quantity_voided, void_revenue, updated_at
      )
      SELECT
        gen_random_uuid()::text, ol.tenant_id, o.location_id, o.business_date,
        ol.catalog_item_id, max(ol.catalog_item_name), max(cc.name),
        coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status IN ('placed', 'paid')), 0),
        coalesce(sum(ol.line_total) FILTER (WHERE o.status IN ('placed', 'paid')), 0) / 100.0,
        coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status = 'voided'), 0),
        coalesce(sum(ol.line_total) FILTER (WHERE o.status = 'voided'), 0) / 100.0,
        NOW()
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      LEFT JOIN catalog_categories cc ON cc.id = ol.sub_department_id
      WHERE ol.tenant_id = ${tenantId}
        AND o.status IN ('placed', 'paid', 'voided')
        AND o.business_date IS NOT NULL
      GROUP BY ol.tenant_id, o.location_id, o.business_date, ol.catalog_item_id
    `) as unknown as { count: number };
    results.rmItemSalesInserted = itemInserted.count ?? 0;

    // 6. Rebuild rm_revenue_activity for POS orders
    await db.execute(sql`
      DELETE FROM rm_revenue_activity
      WHERE tenant_id = ${tenantId} AND source = 'pos_order'
    `);

    const revInserted = await db.execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        reference_number, customer_id, customer_name,
        amount_dollars, subtotal_dollars, tax_dollars,
        discount_dollars, service_charge_dollars,
        status, occurred_at, created_at
      )
      SELECT
        gen_random_uuid()::text, o.tenant_id, o.location_id, o.business_date,
        'pos_order',
        CASE WHEN (o.metadata->>'tabName') IS NOT NULL OR (o.metadata->>'tableNumber') IS NOT NULL
          THEN 'pos_fnb' ELSE 'pos_retail' END,
        o.id, 'Order #' || coalesce(o.order_number, right(o.id, 6)),
        o.order_number,
        o.customer_id,
        COALESCE(c.display_name, c.first_name || ' ' || c.last_name),
        o.total / 100.0,
        o.subtotal / 100.0,
        o.tax_total / 100.0,
        coalesce(o.discount_total, 0) / 100.0,
        coalesce(o.service_charge_total, 0) / 100.0,
        CASE WHEN o.status = 'voided' THEN 'voided' ELSE 'completed' END,
        coalesce(o.placed_at, o.created_at),
        NOW()
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
      WHERE o.tenant_id = ${tenantId}
        AND o.status IN ('placed', 'paid', 'voided')
        AND o.business_date IS NOT NULL
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = EXCLUDED.amount_dollars,
        subtotal_dollars = EXCLUDED.subtotal_dollars,
        tax_dollars = EXCLUDED.tax_dollars,
        discount_dollars = EXCLUDED.discount_dollars,
        service_charge_dollars = EXCLUDED.service_charge_dollars,
        customer_id = COALESCE(EXCLUDED.customer_id, rm_revenue_activity.customer_id),
        customer_name = COALESCE(EXCLUDED.customer_name, rm_revenue_activity.customer_name),
        status = EXCLUDED.status,
        occurred_at = EXCLUDED.occurred_at
    `) as unknown as { count: number };
    results.rmRevenueActivityInserted = revInserted.count ?? 0;

    return NextResponse.json({ ...results, status: 'ok' });
  } catch (error) {
    console.error('[backfill-read-models] Error:', error);
    return NextResponse.json(
      { ...results, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
