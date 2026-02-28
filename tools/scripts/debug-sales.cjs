const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    const orders = await sql`SELECT id, order_number, status, total, created_at FROM orders ORDER BY created_at DESC LIMIT 5`;
    console.log('=== Recent Orders ===');
    for (const o of orders) {
      console.log('  #' + o.order_number + ' | status=' + o.status + ' | total=' + o.total + ' | ' + o.created_at);
    }

    const activity = await sql`SELECT id, source, source_label, amount_dollars, business_date, created_at FROM rm_revenue_activity ORDER BY created_at DESC LIMIT 5`;
    console.log('\n=== rm_revenue_activity (recent 5) ===');
    if (activity.length === 0) console.log('  (empty)');
    for (const a of activity) {
      console.log('  ' + a.source_label + ' | $' + a.amount_dollars + ' | ' + a.business_date + ' | ' + a.created_at);
    }

    const daily = await sql`SELECT business_date, order_count, net_sales FROM rm_daily_sales ORDER BY business_date DESC LIMIT 5`;
    console.log('\n=== rm_daily_sales (recent 5) ===');
    if (daily.length === 0) console.log('  (empty)');
    for (const d of daily) {
      console.log('  ' + d.business_date + ' | orders=' + d.order_count + ' | net=$' + d.net_sales);
    }

    const processed = await sql`SELECT event_id, consumer_name, processed_at FROM processed_events WHERE consumer_name = 'reporting.orderPlaced' ORDER BY processed_at DESC LIMIT 5`;
    console.log('\n=== processed_events for reporting.orderPlaced ===');
    if (processed.length === 0) console.log('  (none found)');
    for (const p of processed) {
      console.log('  event=' + p.event_id + ' | ' + p.processed_at);
    }

    const outbox = await sql`SELECT id, event_type, status, created_at FROM event_outbox WHERE event_type LIKE 'order%' ORDER BY created_at DESC LIMIT 5`;
    console.log('\n=== event_outbox (order events) ===');
    if (outbox.length === 0) console.log('  (none)');
    for (const o of outbox) {
      console.log('  ' + o.event_type + ' | status=' + o.status + ' | ' + o.created_at);
    }

    const counts = await sql`
      SELECT
        (SELECT COUNT(*) FROM orders) as order_count,
        (SELECT COUNT(*) FROM rm_revenue_activity) as activity_count,
        (SELECT COUNT(*) FROM rm_daily_sales) as daily_count,
        (SELECT COUNT(*) FROM processed_events WHERE consumer_name = 'reporting.orderPlaced') as processed_count
    `;
    console.log('\n=== Totals ===');
    console.log('  Orders: ' + counts[0].order_count);
    console.log('  rm_revenue_activity: ' + counts[0].activity_count);
    console.log('  rm_daily_sales rows: ' + counts[0].daily_count);
    console.log('  Processed orderPlaced events: ' + counts[0].processed_count);

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
