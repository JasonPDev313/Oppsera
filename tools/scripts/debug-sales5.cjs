const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    // Check processed_events for any recent activity
    const recent = await sql`
      SELECT consumer_name, COUNT(*) as cnt
      FROM processed_events
      GROUP BY consumer_name
      ORDER BY cnt DESC LIMIT 20
    `;
    console.log('=== Processed events by consumer ===');
    if (recent.length === 0) console.log('  (none)');
    for (const r of recent) console.log('  ' + r.consumer_name + ': ' + r.cnt);

    // Check most recent processed event
    const lastProcessed = await sql`
      SELECT consumer_name, event_id, processed_at
      FROM processed_events
      ORDER BY processed_at DESC LIMIT 5
    `;
    console.log('\n=== Most recent processed events ===');
    if (lastProcessed.length === 0) console.log('  (none)');
    for (const p of lastProcessed) {
      console.log('  ' + p.consumer_name + ' | event=' + p.event_id + ' | ' + p.processed_at);
    }

    // Check recent orders
    const orders = await sql`
      SELECT id, order_number, status, total, created_at
      FROM orders ORDER BY created_at DESC LIMIT 5
    `;
    console.log('\n=== Recent orders ===');
    for (const o of orders) {
      console.log('  #' + o.order_number + ' | ' + o.status + ' | total=' + o.total + ' | ' + o.created_at);
    }

    // Check ALL event-related tables
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%event%' OR table_name LIKE '%outbox%')
      ORDER BY table_name
    `;
    console.log('\n=== Event-related tables ===');
    for (const t of tables) console.log('  ' + t.table_name);

    // Check rm_revenue_activity count
    const raCount = await sql`SELECT COUNT(*) as cnt FROM rm_revenue_activity`;
    console.log('\n=== rm_revenue_activity count: ' + raCount[0].cnt);

    // Check rm_daily_sales recent
    const ds = await sql`
      SELECT business_date, order_count, net_sales
      FROM rm_daily_sales
      ORDER BY business_date DESC LIMIT 5
    `;
    console.log('\n=== rm_daily_sales recent ===');
    if (ds.length === 0) console.log('  (empty)');
    for (const d of ds) {
      console.log('  ' + d.business_date + ' | orders=' + d.order_count + ' | net=$' + d.net_sales);
    }

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
