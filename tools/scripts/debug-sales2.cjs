const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    // Check all columns on rm_revenue_activity
    const cols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'rm_revenue_activity'
      ORDER BY ordinal_position
    `;
    console.log('=== rm_revenue_activity columns ===');
    for (const c of cols) {
      console.log('  ' + c.column_name + ' (' + c.data_type + ')');
    }

    // Check if total_business_revenue exists on rm_daily_sales
    const dsCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rm_daily_sales'
        AND column_name IN ('total_business_revenue', 'pms_revenue', 'ar_revenue', 'source_sub_type', 'reference_number', 'customer_id', 'employee_id', 'subtotal_dollars')
      ORDER BY column_name
    `;
    console.log('\n=== rm_daily_sales extra columns ===');
    for (const c of dsCols) {
      console.log('  ' + c.column_name);
    }

    // Check drizzle migration log
    const migrations = await sql`
      SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10
    `;
    console.log('\n=== Last 10 applied migrations ===');
    for (const m of migrations) {
      console.log('  ' + m.hash + ' | ' + m.created_at);
    }

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
