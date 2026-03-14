/**
 * GET /api/v1/internal/reconcile-read-models
 *
 * Periodic reconciliation that detects and fixes read model gaps.
 * When orders exist for a (tenant, location, business_date) but
 * rm_daily_sales / rm_item_sales do not, this endpoint backfills
 * the missing rows from the source-of-truth tables (orders, order_lines, tenders).
 *
 * Design:
 *   - Lookback window: 14 days (catches stale data without scanning history)
 *   - Tenant cap: 5 tenants per cycle (keeps runtime <30s on Vercel)
 *   - Date cap: 14 dates per tenant (bounded work per cycle)
 *   - Idempotent: uses ON CONFLICT DO UPDATE (safe to run repeatedly)
 *   - Does NOT delete existing rows — only fills gaps and corrects stale aggregates
 *
 * Auth: CRON_SECRET bearer token (same as drain-outbox)
 * Schedule: every 15 minutes via vercel.json cron
 */

import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const LOOKBACK_DAYS = 14;
const MAX_TENANTS_PER_CYCLE = 5;
const MAX_DATES_PER_TENANT = 14;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const startMs = Date.now();

  try {
    // ── Step 1: Detect rm_daily_sales gaps ────────────────────────
    // Find (tenant_id, location_id, business_date) tuples that exist in
    // orders but are missing from rm_daily_sales within the lookback window.
    const dailyGaps = await db.execute(sql`
      WITH order_dates AS (
        SELECT DISTINCT tenant_id, location_id, business_date
        FROM orders
        WHERE status IN ('placed', 'paid')
          AND business_date IS NOT NULL
          AND business_date::date >= CURRENT_DATE - ${LOOKBACK_DAYS}
      ),
      existing AS (
        SELECT DISTINCT tenant_id, location_id, business_date::text AS business_date
        FROM rm_daily_sales
        WHERE business_date >= CURRENT_DATE - ${LOOKBACK_DAYS}
      )
      SELECT od.tenant_id, od.location_id, od.business_date
      FROM order_dates od
      LEFT JOIN existing e
        ON e.tenant_id = od.tenant_id
        AND e.location_id = od.location_id
        AND e.business_date = od.business_date
      WHERE e.tenant_id IS NULL
      ORDER BY od.business_date DESC
    `) as unknown as Array<{ tenant_id: string; location_id: string; business_date: string }>;

    const dailyGapArr = Array.from(
      dailyGaps as Iterable<{ tenant_id: string; location_id: string; business_date: string }>,
    );
    results.dailyGapsFound = dailyGapArr.length;

    if (dailyGapArr.length > 0) {
      console.warn(
        `[reconcile-read-models] Found ${dailyGapArr.length} rm_daily_sales gap(s) in last ${LOOKBACK_DAYS} days`,
      );
    }

    // ── Step 2: Detect stale rm_daily_sales rows ──────────────────
    // Rows that exist but have an order_count mismatch (e.g., events were
    // partially processed). Only check recent dates to keep query fast.
    const staleRows = await db.execute(sql`
      WITH order_counts AS (
        SELECT tenant_id, location_id, business_date,
               count(*) FILTER (WHERE status IN ('placed', 'paid'))::int AS expected_count
        FROM orders
        WHERE status IN ('placed', 'paid', 'voided')
          AND business_date IS NOT NULL
          AND business_date::date >= CURRENT_DATE - ${LOOKBACK_DAYS}
        GROUP BY tenant_id, location_id, business_date
      )
      SELECT oc.tenant_id, oc.location_id, oc.business_date,
             oc.expected_count, rds.order_count AS actual_count
      FROM order_counts oc
      JOIN rm_daily_sales rds
        ON rds.tenant_id = oc.tenant_id
        AND rds.location_id = oc.location_id
        AND rds.business_date::text = oc.business_date
      WHERE oc.expected_count != rds.order_count
      ORDER BY oc.business_date DESC
      LIMIT 50
    `) as unknown as Array<{
      tenant_id: string; location_id: string; business_date: string;
      expected_count: number; actual_count: number;
    }>;

    const staleArr = Array.from(
      staleRows as Iterable<{
        tenant_id: string; location_id: string; business_date: string;
        expected_count: number; actual_count: number;
      }>,
    );
    results.staleRowsFound = staleArr.length;

    if (staleArr.length > 0) {
      console.warn(
        `[reconcile-read-models] Found ${staleArr.length} stale rm_daily_sales row(s) (order_count mismatch)`,
      );
    }

    // ── Step 3: Merge gaps + stale into a repair set ─────────────
    // Deduplicate by (tenant_id, location_id, business_date) and cap per tenant.
    const repairSet = new Map<string, Set<string>>(); // tenant_id → Set<"location_id|business_date">

    for (const gap of dailyGapArr) {
      const key = `${gap.location_id}|${gap.business_date}`;
      if (!repairSet.has(gap.tenant_id)) repairSet.set(gap.tenant_id, new Set());
      repairSet.get(gap.tenant_id)!.add(key);
    }
    for (const stale of staleArr) {
      const key = `${stale.location_id}|${stale.business_date}`;
      if (!repairSet.has(stale.tenant_id)) repairSet.set(stale.tenant_id, new Set());
      repairSet.get(stale.tenant_id)!.add(key);
    }

    // Cap tenants
    const tenantIds = Array.from(repairSet.keys()).slice(0, MAX_TENANTS_PER_CYCLE);
    results.tenantsToRepair = tenantIds.length;

    if (tenantIds.length === 0) {
      results.status = 'ok';
      results.message = 'No gaps or stale rows detected';
      results.elapsedMs = Date.now() - startMs;
      return NextResponse.json(results);
    }

    // ── Step 4: Repair each tenant ────────────────────────────────
    let totalDailyRepaired = 0;
    let totalItemRepaired = 0;

    for (const tenantId of tenantIds) {
      const dateKeys = Array.from(repairSet.get(tenantId)!).slice(0, MAX_DATES_PER_TENANT);
      const businessDates = Array.from(new Set(dateKeys.map((k) => k.split('|')[1]!)));

      console.log(
        `[reconcile-read-models] Repairing tenant ${tenantId}: ${businessDates.length} date(s)`,
      );

      // 4a. Upsert rm_daily_sales for the gap dates
      const dailyRepaired = await db.execute(sql`
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
            AND business_date = ANY(${businessDates}::text[])
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
          WHERE t.tenant_id = ${tenantId}
            AND t.status = 'captured'
            AND o.business_date IS NOT NULL
            AND o.business_date = ANY(${businessDates}::text[])
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
        ON CONFLICT (tenant_id, location_id, business_date)
        DO UPDATE SET
          order_count = EXCLUDED.order_count,
          gross_sales = EXCLUDED.gross_sales,
          discount_total = EXCLUDED.discount_total,
          tax_total = EXCLUDED.tax_total,
          net_sales = EXCLUDED.net_sales,
          service_charge_total = EXCLUDED.service_charge_total,
          tender_cash = EXCLUDED.tender_cash,
          tender_card = EXCLUDED.tender_card,
          tender_gift_card = EXCLUDED.tender_gift_card,
          tender_house_account = EXCLUDED.tender_house_account,
          tender_ach = EXCLUDED.tender_ach,
          tender_other = EXCLUDED.tender_other,
          tip_total = EXCLUDED.tip_total,
          surcharge_total = EXCLUDED.surcharge_total,
          void_count = EXCLUDED.void_count,
          void_total = EXCLUDED.void_total,
          avg_order_value = EXCLUDED.avg_order_value,
          total_business_revenue = EXCLUDED.total_business_revenue,
          updated_at = NOW()
      `) as unknown as { count: number };
      totalDailyRepaired += (dailyRepaired.count ?? 0);

      // 4b. Upsert rm_item_sales for the gap dates
      const itemRepaired = await db.execute(sql`
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
          AND o.business_date = ANY(${businessDates}::text[])
        GROUP BY ol.tenant_id, o.location_id, o.business_date, ol.catalog_item_id
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          catalog_item_name = EXCLUDED.catalog_item_name,
          category_name = COALESCE(EXCLUDED.category_name, rm_item_sales.category_name),
          quantity_sold = EXCLUDED.quantity_sold,
          gross_revenue = EXCLUDED.gross_revenue,
          quantity_voided = EXCLUDED.quantity_voided,
          void_revenue = EXCLUDED.void_revenue,
          updated_at = NOW()
      `) as unknown as { count: number };
      totalItemRepaired += (itemRepaired.count ?? 0);

      // 4c. Upsert rm_revenue_activity for gap dates
      await db.execute(sql`
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
          AND o.business_date = ANY(${businessDates}::text[])
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
      `);

      console.log(
        `[reconcile-read-models] Tenant ${tenantId}: repaired ${dailyRepaired.count ?? 0} daily + ${itemRepaired.count ?? 0} item rows`,
      );
    }

    results.totalDailyRepaired = totalDailyRepaired;
    results.totalItemRepaired = totalItemRepaired;
    results.status = 'ok';
    results.elapsedMs = Date.now() - startMs;

    if (totalDailyRepaired > 0 || totalItemRepaired > 0) {
      console.warn(
        `[reconcile-read-models] Repaired ${totalDailyRepaired} rm_daily_sales + ${totalItemRepaired} rm_item_sales rows across ${tenantIds.length} tenant(s) in ${results.elapsedMs}ms`,
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('[reconcile-read-models] Error:', error);
    return NextResponse.json(
      {
        ...results,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        elapsedMs: Date.now() - startMs,
      },
      { status: 500 },
    );
  }
}
