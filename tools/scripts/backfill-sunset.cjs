/**
 * Backfill rm_revenue_activity for Sunset Golf & Grill on production.
 * This rebuilds the sales history view from operational data.
 * Run: node tools/scripts/backfill-sunset.cjs
 */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.vercel-prod' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 10, prepare: false });

(async () => {
  try {
    // Find tenant
    const tenants = await sql`
      SELECT id, name FROM tenants WHERE LOWER(name) LIKE '%sunset%' LIMIT 1
    `;
    if (tenants.length === 0) { console.log('Tenant not found'); process.exit(1); }
    const tenantId = tenants[0].id;
    console.log('Tenant: ' + tenants[0].name + ' (' + tenantId + ')');

    // 1. Clear existing rm_revenue_activity
    console.log('\n=== Clearing rm_revenue_activity ===');
    const del = await sql`DELETE FROM rm_revenue_activity WHERE tenant_id = ${tenantId}`;
    console.log('  Deleted: ' + del.count + ' rows');

    // 2. Backfill from POS orders
    console.log('\n=== Backfilling POS orders into rm_revenue_activity ===');
    await sql`
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
        o.tenant_id, o.location_id, o.business_date,
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
    `;
    const posCount = await sql`
      SELECT count(*)::int AS cnt FROM rm_revenue_activity
      WHERE tenant_id = ${tenantId} AND source = 'pos_order'
    `;
    console.log('  Inserted POS order rows: ' + posCount[0].cnt);

    // 3. Also refresh rm_daily_sales to make sure it's accurate
    console.log('\n=== Refreshing rm_daily_sales ===');
    await sql`DELETE FROM rm_daily_sales WHERE tenant_id = ${tenantId}`;
    await sql`
      WITH order_agg AS (
        SELECT
          tenant_id, location_id, business_date,
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
          t.tenant_id, o.location_id, o.business_date,
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
        void_count, void_total, avg_order_value, updated_at
      )
      SELECT
        gen_random_uuid()::text,
        oa.tenant_id, oa.location_id, oa.business_date,
        oa.order_count, oa.gross_sales, oa.discount_total, oa.tax_total, oa.net_sales,
        coalesce(ta.tender_cash, 0), coalesce(ta.tender_card, 0),
        coalesce(ta.tender_gift_card, 0), coalesce(ta.tender_house_account, 0),
        coalesce(ta.tender_ach, 0), coalesce(ta.tender_other, 0),
        coalesce(ta.tip_total, 0), coalesce(ta.surcharge_total, 0),
        oa.void_count, oa.void_total,
        CASE WHEN oa.order_count > 0 THEN oa.net_sales / oa.order_count ELSE 0 END,
        NOW()
      FROM order_agg oa
      LEFT JOIN tender_agg ta
        ON ta.tenant_id = oa.tenant_id
        AND ta.location_id = oa.location_id
        AND ta.business_date = oa.business_date
    `;
    const dsCount = await sql`SELECT count(*)::int AS cnt FROM rm_daily_sales WHERE tenant_id = ${tenantId}`;
    console.log('  Rebuilt rm_daily_sales rows: ' + dsCount[0].cnt);

    // 4. Refresh rm_item_sales
    console.log('\n=== Refreshing rm_item_sales ===');
    await sql`DELETE FROM rm_item_sales WHERE tenant_id = ${tenantId}`;
    await sql`
      INSERT INTO rm_item_sales (
        id, tenant_id, location_id, business_date,
        catalog_item_id, catalog_item_name,
        quantity_sold, gross_revenue,
        quantity_voided, void_revenue, updated_at
      )
      SELECT
        gen_random_uuid()::text,
        ol.tenant_id, o.location_id, o.business_date,
        ol.catalog_item_id, max(ol.catalog_item_name),
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
    `;
    const isCount = await sql`SELECT count(*)::int AS cnt FROM rm_item_sales WHERE tenant_id = ${tenantId}`;
    console.log('  Rebuilt rm_item_sales rows: ' + isCount[0].cnt);

    // 5. Verify
    console.log('\n=== Verification ===');
    const verify = await sql`
      SELECT
        (SELECT count(*)::int FROM rm_daily_sales WHERE tenant_id = ${tenantId}) AS daily,
        (SELECT count(*)::int FROM rm_item_sales WHERE tenant_id = ${tenantId}) AS items,
        (SELECT count(*)::int FROM rm_revenue_activity WHERE tenant_id = ${tenantId}) AS activity
    `;
    const v = verify[0];
    console.log('  rm_daily_sales: ' + v.daily + ' rows');
    console.log('  rm_item_sales: ' + v.items + ' rows');
    console.log('  rm_revenue_activity: ' + v.activity + ' rows');

    const recentDaily = await sql`
      SELECT business_date, order_count, net_sales
      FROM rm_daily_sales WHERE tenant_id = ${tenantId}
      ORDER BY business_date DESC LIMIT 5
    `;
    console.log('\n=== Latest daily sales ===');
    for (const d of recentDaily) {
      console.log('  ' + d.business_date + ' | orders=' + d.order_count + ' | net=$' + d.net_sales);
    }

    const recentActivity = await sql`
      SELECT source_label, amount_dollars, business_date, status
      FROM rm_revenue_activity WHERE tenant_id = ${tenantId}
      ORDER BY occurred_at DESC LIMIT 5
    `;
    console.log('\n=== Latest revenue activity ===');
    for (const a of recentActivity) {
      console.log('  ' + a.source_label + ' | $' + a.amount_dollars + ' | ' + a.business_date + ' | ' + a.status);
    }

    console.log('\nBackfill complete! Sales history should now be visible.');
    await sql.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    await sql.end();
    process.exit(1);
  }
})();
