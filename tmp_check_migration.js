const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function check() {
  try {
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'entitlements' AND column_name = 'access_mode'
    `;
    console.log('access_mode column exists:', cols.length > 0);

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('entitlement_change_log', 'module_templates')
    `;
    console.log('New tables exist:', tables.map(t => t.table_name));

    // Also test the exact tenant list query
    const tenants = await sql`
      SELECT t.id, t.name, t.slug
      FROM tenants t
      WHERE t.deleted_at IS NULL
      LIMIT 5
    `;
    console.log('Tenants found:', tenants.length, tenants.map(t => t.name));

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}

check();
