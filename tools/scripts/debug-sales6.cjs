const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    // Check if recent orders have business_date set
    const orders = await sql`
      SELECT id, order_number, status, total, business_date, created_at
      FROM orders
      ORDER BY created_at DESC LIMIT 10
    `;
    console.log('=== Recent orders (with business_date) ===');
    for (const o of orders) {
      console.log('  #' + o.order_number + ' | status=' + o.status + ' | total=' + o.total + ' | biz_date=' + o.business_date + ' | created=' + o.created_at);
    }

    // Check if rm_revenue_activity has the unique constraint on (tenant_id, source, source_id)
    const indexes = await sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'rm_revenue_activity'
    `;
    console.log('\n=== rm_revenue_activity indexes ===');
    for (const i of indexes) {
      console.log('  ' + i.indexname + ': ' + i.indexdef);
    }

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
