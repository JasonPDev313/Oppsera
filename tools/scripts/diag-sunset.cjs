/**
 * Diagnose missing sales data for Sunset Bar and Grill (production).
 * Run: node tools/scripts/diag-sunset.cjs
 */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.vercel-prod' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, prepare: false });

(async () => {
  try {
    console.log('=== Finding Sunset Bar and Grill ===');
    const tenants = await sql`
      SELECT id, name, created_at FROM tenants
      WHERE LOWER(name) LIKE '%sunset%'
      ORDER BY created_at DESC
    `;
    if (tenants.length === 0) {
      console.log('No tenant found matching "sunset". Listing all tenants:');
      const all = await sql`SELECT id, name FROM tenants ORDER BY name`;
      for (const t of all) console.log('  ' + t.name + ' (' + t.id + ')');
      await sql.end();
      process.exit(1);
    }
    const tenant = tenants[0];
    const tenantId = tenant.id;
    console.log('Found: ' + tenant.name + ' (' + tenantId + ')');

    console.log('\n=== Operational Data (orders table - SOURCE OF TRUTH) ===');
    const orderCounts = await sql`
      SELECT
        count(*)::int AS total_orders,
        count(*) FILTER (WHERE status IN ('placed', 'paid'))::int AS active_orders,
        count(*) FILTER (WHERE status = 'voided')::int AS voided_orders,
        min(created_at) AS oldest_order,
        max(created_at) AS newest_order,
        min(business_date) AS oldest_biz_date,
        max(business_date) AS newest_biz_date,
        count(*) FILTER (WHERE business_date IS NULL)::int AS null_biz_date,
        coalesce(sum(total) FILTER (WHERE status IN ('placed', 'paid')), 0)::bigint AS total_revenue_cents
      FROM orders
      WHERE tenant_id = ${tenantId}
    `;
    const oc = orderCounts[0];
    console.log('  Total orders: ' + oc.total_orders);
    console.log('  Active (placed/paid): ' + oc.active_orders);
    console.log('  Voided: ' + oc.voided_orders);
    console.log('  Null business_date: ' + oc.null_biz_date);
    console.log('  Date range: ' + oc.oldest_biz_date + ' to ' + oc.newest_biz_date);
    console.log('  Created range: ' + oc.oldest_order + ' to ' + oc.newest_order);
    console.log('  Total revenue: $' + (Number(oc.total_revenue_cents) / 100).toFixed(2));

    console.log('\n=== Tenders ===');
    const tenderCounts = await sql`
      SELECT
        count(*)::int AS total_tenders,
        count(*) FILTER (WHERE status = 'captured')::int AS captured,
        coalesce(sum(amount) FILTER (WHERE status = 'captured'), 0)::bigint AS total_tendered_cents
      FROM tenders
      WHERE tenant_id = ${tenantId}
    `;
    const tc = tenderCounts[0];
    console.log('  Total tenders: ' + tc.total_tenders);
    console.log('  Captured: ' + tc.captured);
    console.log('  Total tendered: $' + (Number(tc.total_tendered_cents) / 100).toFixed(2));

    console.log('\n=== Reporting Read Models (what powers the UI) ===');
    const rmCounts = await sql`
      SELECT
        (SELECT count(*)::int FROM rm_daily_sales WHERE tenant_id = ${tenantId}) AS daily_sales,
        (SELECT count(*)::int FROM rm_item_sales WHERE tenant_id = ${tenantId}) AS item_sales,
        (SELECT count(*)::int FROM rm_revenue_activity WHERE tenant_id = ${tenantId}) AS revenue_activity,
        (SELECT count(*)::int FROM rm_inventory_on_hand WHERE tenant_id = ${tenantId}) AS inventory
    `;
    const rm = rmCounts[0];
    console.log('  rm_daily_sales rows: ' + rm.daily_sales);
    console.log('  rm_item_sales rows: ' + rm.item_sales);
    console.log('  rm_revenue_activity rows: ' + rm.revenue_activity);
    console.log('  rm_inventory_on_hand rows: ' + rm.inventory);

    if (rm.daily_sales > 0) {
      console.log('\n=== Recent rm_daily_sales ===');
      const recent = await sql`
        SELECT business_date, order_count, net_sales, tender_cash, tender_card
        FROM rm_daily_sales
        WHERE tenant_id = ${tenantId}
        ORDER BY business_date DESC LIMIT 10
      `;
      for (const r of recent) {
        console.log('  ' + r.business_date + ' | orders=' + r.order_count + ' | net=$' + r.net_sales + ' | cash=$' + r.tender_cash + ' | card=$' + r.tender_card);
      }
    }

    console.log('\n=== 10 Most Recent Orders ===');
    const recentOrders = await sql`
      SELECT order_number, status, total, business_date, created_at
      FROM orders
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC LIMIT 10
    `;
    for (const o of recentOrders) {
      console.log('  #' + o.order_number + ' | ' + o.status + ' | $' + (Number(o.total) / 100).toFixed(2) + ' | biz=' + o.business_date + ' | ' + o.created_at);
    }

    console.log('\n=== Processed Events (reporting consumers) ===');
    const processed = await sql`
      SELECT consumer_name, count(*)::int AS cnt
      FROM processed_events
      WHERE tenant_id = ${tenantId}
      GROUP BY consumer_name
      ORDER BY cnt DESC
    `;
    if (processed.length === 0) console.log('  (no processed events found)');
    for (const p of processed) {
      console.log('  ' + p.consumer_name + ': ' + p.cnt);
    }

    console.log('\n=== DIAGNOSIS ===');
    if (Number(oc.total_orders) === 0) {
      console.log('  NO ORDERS FOUND - operational data is missing.');
    } else if (rm.daily_sales === 0 && rm.revenue_activity === 0) {
      console.log('  Orders exist (' + oc.total_orders + ') but read models are EMPTY.');
      console.log('  -> Your data is SAFE. Run backfill to restore reporting views.');
    } else if (rm.daily_sales > 0 && Number(oc.total_orders) > 0) {
      const oldest = new Date(oc.oldest_biz_date);
      const newest = new Date(oc.newest_biz_date);
      const expectedDays = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24));
      if (rm.daily_sales < expectedDays * 0.5) {
        console.log('  Read models PARTIALLY populated (' + rm.daily_sales + ' days out of ~' + expectedDays + ' expected).');
        console.log('  -> Run backfill to rebuild.');
      } else {
        console.log('  Data looks healthy: ' + oc.total_orders + ' orders, ' + rm.daily_sales + ' daily sales rows.');
        console.log('  Issue may be frontend filters (date range, location).');
      }
    }

    await sql.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
