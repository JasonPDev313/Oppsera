const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function check() {
  try {
    // Check platform_admins table
    const admins = await sql`SELECT id, email, name, role, is_active FROM platform_admins`;
    console.log('Platform admins:', admins.length);
    admins.forEach(a => console.log(' -', a.email, '| role:', a.role, '| active:', a.is_active));

    // Check if tenants table has status column
    const tenantCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tenants'
      ORDER BY ordinal_position
    `;
    console.log('\nTenants columns:', tenantCols.map(c => c.column_name));

    // Check actual tenant data
    const tenants = await sql`SELECT id, name, slug, status, created_at FROM tenants LIMIT 5`;
    console.log('\nTenants:', tenants.length);
    tenants.forEach(t => console.log(' -', t.name, '| slug:', t.slug, '| status:', t.status));

    // Check if the enrichment query works
    console.log('\nTesting enrichment query...');
    const rows = await sql`
      SELECT
        t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at,
        (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'site' AND is_active = true) AS site_count,
        (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'venue' AND is_active = true) AS venue_count,
        (SELECT COUNT(*)::int FROM terminal_locations WHERE tenant_id = t.id AND is_active = true) AS profit_center_count,
        (SELECT COUNT(*)::int FROM terminals WHERE tenant_id = t.id AND is_active = true) AS terminal_count,
        (SELECT COUNT(*)::int FROM users WHERE tenant_id = t.id AND status = 'active') AS user_count
      FROM tenants t
      ORDER BY t.created_at DESC
      LIMIT 5
    `;
    console.log('Enrichment query works! Rows:', rows.length);
    rows.forEach(r => console.log(' -', r.name, '| sites:', r.site_count, '| users:', r.user_count));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}

check();
