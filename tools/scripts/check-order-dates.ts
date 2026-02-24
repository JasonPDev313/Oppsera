import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.remote', override: true });
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  const [range] = await sql`
    SELECT
      min(business_date) as earliest,
      max(business_date) as latest,
      count(*)::int as total_orders,
      count(DISTINCT business_date)::int as distinct_dates
    FROM orders
    WHERE status IN ('placed', 'paid', 'voided')
  `;
  console.log('Order date range:', JSON.stringify(range, null, 2));

  const recent = await sql`
    SELECT business_date, count(*)::int as cnt
    FROM orders
    WHERE status IN ('placed', 'paid', 'voided')
    GROUP BY business_date
    ORDER BY business_date DESC
    LIMIT 10
  `;
  console.log('\nOrders by date (most recent 10):');
  for (const r of recent) {
    console.log(`  ${r.business_date}: ${r.cnt} orders`);
  }

  const [rmDaily] = await sql`SELECT count(*)::int as cnt FROM rm_daily_sales`;
  const [rmItem] = await sql`SELECT count(*)::int as cnt FROM rm_item_sales`;
  console.log(`\nrm_daily_sales rows: ${rmDaily.cnt}`);
  console.log(`rm_item_sales rows: ${rmItem.cnt}`);

  const tenants = await sql`SELECT DISTINCT tenant_id, count(*)::int as cnt FROM orders GROUP BY tenant_id`;
  console.log('\nTenants with orders:');
  for (const t of tenants) console.log(`  ${t.tenant_id}: ${t.cnt} orders`);

  // Now backfill read models for each tenant
  for (const t of tenants) {
    const tenantId = t.tenant_id as string;
    console.log(`\nBackfilling read models for tenant ${tenantId}...`);

    await sql`DELETE FROM rm_daily_sales WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM rm_item_sales WHERE tenant_id = ${tenantId}`;

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
        WHERE tenant_id = ${tenantId} AND status IN ('placed', 'paid', 'voided') AND business_date IS NOT NULL
        GROUP BY tenant_id, location_id, business_date
      ),
      tender_agg AS (
        SELECT
          t.tenant_id, o.location_id, o.business_date,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'cash' AND t.status = 'captured'), 0) / 100.0 AS tender_cash,
          coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'card' AND t.status = 'captured'), 0) / 100.0 AS tender_card
        FROM tenders t JOIN orders o ON o.id = t.order_id
        WHERE t.tenant_id = ${tenantId} AND t.status = 'captured' AND o.business_date IS NOT NULL
        GROUP BY t.tenant_id, o.location_id, o.business_date
      )
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        order_count, gross_sales, discount_total, tax_total, net_sales,
        tender_cash, tender_card, void_count, void_total, avg_order_value, updated_at
      )
      SELECT
        gen_random_uuid()::text, oa.tenant_id, oa.location_id, oa.business_date,
        oa.order_count, oa.gross_sales, oa.discount_total, oa.tax_total, oa.net_sales,
        coalesce(ta.tender_cash, 0), coalesce(ta.tender_card, 0),
        oa.void_count, oa.void_total,
        CASE WHEN oa.order_count > 0 THEN oa.net_sales / oa.order_count ELSE 0 END,
        NOW()
      FROM order_agg oa
      LEFT JOIN tender_agg ta ON ta.tenant_id = oa.tenant_id AND ta.location_id = oa.location_id AND ta.business_date = oa.business_date
    `;

    await sql`
      INSERT INTO rm_item_sales (
        id, tenant_id, location_id, business_date,
        catalog_item_id, catalog_item_name, category_name,
        quantity_sold, gross_revenue, quantity_voided, void_revenue, updated_at
      )
      SELECT
        gen_random_uuid()::text, ol.tenant_id, o.location_id, o.business_date,
        ol.catalog_item_id, max(ol.catalog_item_name), max(c.name),
        coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status IN ('placed', 'paid')), 0),
        coalesce(sum(ol.line_total) FILTER (WHERE o.status IN ('placed', 'paid')), 0) / 100.0,
        coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status = 'voided'), 0),
        coalesce(sum(ol.line_total) FILTER (WHERE o.status = 'voided'), 0) / 100.0,
        NOW()
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      LEFT JOIN catalog_categories c ON c.id = ol.sub_department_id
      WHERE ol.tenant_id = ${tenantId} AND o.status IN ('placed', 'paid', 'voided') AND o.business_date IS NOT NULL
      GROUP BY ol.tenant_id, o.location_id, o.business_date, ol.catalog_item_id
    `;

    const [dc] = await sql`SELECT count(*)::int as cnt FROM rm_daily_sales WHERE tenant_id = ${tenantId}`;
    const [ic] = await sql`SELECT count(*)::int as cnt FROM rm_item_sales WHERE tenant_id = ${tenantId}`;
    console.log(`  rm_daily_sales: ${dc.cnt} rows`);
    console.log(`  rm_item_sales: ${ic.cnt} rows`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
