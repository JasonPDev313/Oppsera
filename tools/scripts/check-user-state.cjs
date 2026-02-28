const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set. Create .env.remote with your production DB URL.');
  process.exit(1);
}
console.log('Connecting to:', url.replace(/:[^:@]+@/, ':***@'));

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });

async function check() {
  console.log('\n=== USERS ===');
  const users = await sql`
    SELECT id, email, name, auth_provider_id, created_at
    FROM users ORDER BY created_at DESC LIMIT 20
  `;
  users.forEach(u => {
    console.log(`  ${u.email} | id=${u.id} | auth_provider_id=${u.auth_provider_id || 'NULL'}`);
  });

  console.log('\n=== MEMBERSHIPS ===');
  const memberships = await sql`
    SELECT m.id, m.user_id, m.tenant_id, m.status, u.email
    FROM memberships m LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC LIMIT 20
  `;
  if (memberships.length === 0) console.log('  *** NO MEMBERSHIPS FOUND ***');
  memberships.forEach(m => {
    console.log(`  user=${m.email} | tenant=${m.tenant_id} | status=${m.status}`);
  });

  console.log('\n=== TENANTS ===');
  const tenants = await sql`
    SELECT id, name, status FROM tenants ORDER BY created_at DESC LIMIT 10
  `;
  if (tenants.length === 0) console.log('  *** NO TENANTS FOUND ***');
  tenants.forEach(t => {
    console.log(`  ${t.name} | id=${t.id} | status=${t.status}`);
  });

  console.log('\n=== ENTITLEMENTS (platform_core) ===');
  const entitlements = await sql`
    SELECT e.tenant_id, e.module_key, e.access_mode, t.name as tenant_name
    FROM entitlements e LEFT JOIN tenants t ON t.id = e.tenant_id
    WHERE e.module_key = 'platform_core' LIMIT 10
  `;
  if (entitlements.length === 0) console.log('  *** NO platform_core ENTITLEMENTS FOUND ***');
  entitlements.forEach(e => {
    console.log(`  tenant=${e.tenant_name} | module=${e.module_key} | mode=${e.access_mode}`);
  });

  console.log('\n=== ROLE ASSIGNMENTS ===');
  const roles = await sql`
    SELECT ra.user_id, ra.role_id, r.name as role_name, u.email
    FROM role_assignments ra
    JOIN roles r ON r.id = ra.role_id
    LEFT JOIN users u ON u.id = ra.user_id
    ORDER BY ra.created_at DESC LIMIT 20
  `;
  if (roles.length === 0) console.log('  *** NO ROLE ASSIGNMENTS FOUND ***');
  roles.forEach(r => {
    console.log(`  user=${r.email} | role=${r.role_name} | role_id=${r.role_id}`);
  });

  console.log('\n=== DIAGNOSIS ===');
  if (memberships.length === 0) console.log('  PROBLEM: No memberships. Users cannot access any tenant.');
  const inactive = memberships.filter(m => m.status !== 'active');
  if (inactive.length > 0) {
    console.log('  WARNING: Inactive memberships:');
    inactive.forEach(m => console.log(`    user=${m.email} status=${m.status}`));
  }
  const noAuth = users.filter(u => !u.auth_provider_id);
  if (noAuth.length > 0) {
    console.log('  WARNING: Users without auth_provider_id (cannot login via Supabase):');
    noAuth.forEach(u => console.log(`    ${u.email}`));
  }

  await sql.end();
}

check().catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });
