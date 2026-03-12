const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) {
  console.error('ERROR: DATABASE_URL not set. Check .env.remote or .env.local');
  process.exit(1);
}
const sql = postgres(connStr, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10
});

(async () => {
  try {
    // Check all fnb_ tables exist
    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'fnb_%' ORDER BY tablename`;
    console.log('=== FnB tables in production ===');
    tables.forEach(t => console.log('  ' + t.tablename));
    console.log('Total:', tables.length);

    // Check columns on key tables
    const cols = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('fnb_course_definitions', 'fnb_course_rules', 'fnb_kds_stations', 'fnb_kds_location_settings') ORDER BY table_name, ordinal_position`;
    console.log('\n=== Columns on key tables ===');
    let lastTable = '';
    cols.forEach(c => {
      if (c.table_name !== lastTable) {
        console.log('\n' + c.table_name + ':');
        lastTable = c.table_name;
      }
      console.log('  ' + c.column_name);
    });

    await sql.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
