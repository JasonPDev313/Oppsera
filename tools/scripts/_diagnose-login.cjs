const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL_ADMIN;
if (!url) {
  console.error('DATABASE_URL_ADMIN not set');
  process.exit(1);
}
console.log('Connecting via ADMIN (direct) to:', url.replace(/:[^:@]+@/, ':***@'));

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });

async function run() {
  // 1. Check active connections
  console.log('\n=== ACTIVE DB CONNECTIONS ===');
  const conns = await sql`
    SELECT pid, state, query, wait_event_type, wait_event,
           age(clock_timestamp(), query_start) AS query_age,
           age(clock_timestamp(), state_change) AS state_age,
           usename, application_name
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    ORDER BY state_change DESC
  `;
  if (conns.length === 0) {
    console.log('  No active connections (besides this script)');
  }
  conns.forEach(c => {
    console.log('  pid=' + c.pid + ' state=' + c.state + ' age=' + c.query_age + ' wait=' + (c.wait_event_type || 'none') + ' user=' + c.usename);
    if (c.query && c.query.length > 0) {
      console.log('    query: ' + c.query.substring(0, 120));
    }
  });

  // 2. Check statement_timeout
  console.log('\n=== DB SETTINGS ===');
  const settings = await sql`
    SELECT name, setting FROM pg_settings
    WHERE name IN ('statement_timeout', 'idle_in_transaction_session_timeout', 'lock_timeout')
  `;
  settings.forEach(s => console.log('  ' + s.name + ' = ' + s.setting));

  // 3. Check which user jp@jasonpearsall.com has
  console.log('\n=== JP USER CHECK ===');
  const jpUser = await sql`
    SELECT u.id, u.email, u.auth_provider_id,
           m.tenant_id, m.status AS membership_status,
           t.name AS tenant_name, t.status AS tenant_status
    FROM users u
    LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
    LEFT JOIN tenants t ON t.id = m.tenant_id
    WHERE u.email = 'jp@jasonpearsall.com'
  `;
  if (jpUser.length === 0) {
    console.log('  USER NOT FOUND');
  } else {
    const u = jpUser[0];
    console.log('  id=' + u.id);
    console.log('  auth_provider_id=' + (u.auth_provider_id || 'NULL'));
    console.log('  tenant_id=' + (u.tenant_id || 'NULL'));
    console.log('  membership_status=' + (u.membership_status || 'NULL'));
    console.log('  tenant_name=' + (u.tenant_name || 'NULL'));
    console.log('  tenant_status=' + (u.tenant_status || 'NULL'));
  }

  // 4. Check role assignments for JP
  console.log('\n=== JP ROLE ASSIGNMENTS ===');
  const jpRoles = await sql`
    SELECT ra.id AS assignment_id, ra.role_id, r.name AS role_name,
           r.is_system, ra.location_id,
           COALESCE(l.name, '(tenant-wide)') AS location_name
    FROM role_assignments ra
    JOIN roles r ON r.id = ra.role_id
    LEFT JOIN locations l ON l.id = ra.location_id
    WHERE ra.user_id = (SELECT id FROM users WHERE email = 'jp@jasonpearsall.com' LIMIT 1)
  `;
  if (jpRoles.length === 0) {
    console.log('  *** NO ROLE ASSIGNMENTS ***');
  } else {
    jpRoles.forEach(r => {
      console.log('  role=' + r.role_name + ' system=' + r.is_system + ' location=' + r.location_name);
    });
  }

  // 5. Simulate the EXACT validateToken query the middleware runs
  console.log('\n=== SIMULATED validateToken QUERY ===');
  const jpAuthId = jpUser.length > 0 ? jpUser[0].auth_provider_id : null;
  if (!jpAuthId) {
    console.log('  SKIP - no auth_provider_id');
  } else {
    const authResult = await sql`
      SELECT u.id, u.email, u.name, u.auth_provider_id,
             m.tenant_id, m.status AS membership_status,
             t.name AS tenant_name, t.status AS tenant_status
      FROM users u
      LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
      LEFT JOIN tenants t ON t.id = m.tenant_id
      WHERE u.auth_provider_id = ${jpAuthId}
      LIMIT 1
    `;
    if (authResult.length === 0) {
      console.log('  *** validateToken would return NULL - user not found by auth_provider_id ***');
    } else {
      const a = authResult[0];
      console.log('  Result: email=' + a.email + ' tenantId=' + (a.tenant_id || 'NULL') + ' membershipStatus=' + (a.membership_status || 'NULL'));
      if (!a.tenant_id) {
        console.log('  *** PROBLEM: tenantId is NULL - resolveTenant() will throw NoMembershipError ***');
      }
      if (a.membership_status !== 'active') {
        console.log('  *** PROBLEM: membership status is not active ***');
      }
    }
  }

  // 6. Simulate the getUserRoleAssignments query WITH RLS
  console.log('\n=== SIMULATED my-roles WITH RLS (via pooler) ===');
  const poolUrl = process.env.DATABASE_URL;
  if (!poolUrl) {
    console.log('  SKIP - no DATABASE_URL');
  } else {
    const poolSql = postgres(poolUrl, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
    try {
      const jpTenantId = jpUser.length > 0 ? jpUser[0].tenant_id : null;
      const jpId = jpUser.length > 0 ? jpUser[0].id : null;
      if (!jpTenantId || !jpId) {
        console.log('  SKIP - no tenant_id or user_id');
      } else {
        const rlsRoles = await poolSql.begin(async (tx) => {
          await tx`SELECT set_config('app.current_tenant_id', ${jpTenantId}, true)`;
          return tx`
            SELECT ra.id AS assignment_id, ra.role_id, r.name AS role_name,
                   r.is_system, r.scope, ra.location_id,
                   l.name AS location_name
            FROM role_assignments ra
            INNER JOIN roles r ON r.id = ra.role_id
            LEFT JOIN locations l ON l.id = ra.location_id
            WHERE ra.tenant_id = ${jpTenantId} AND ra.user_id = ${jpId}
          `;
        });
        if (rlsRoles.length === 0) {
          console.log('  *** NO ROLES via RLS ***');
        } else {
          rlsRoles.forEach(r => {
            console.log('  role=' + r.role_name + ' system=' + r.is_system + ' scope=' + r.scope + ' location=' + (r.location_name || '(tenant-wide)'));
          });
        }
      }
    } catch (e) {
      console.log('  ERROR via pooler: ' + e.message);
    } finally {
      await poolSql.end();
    }
  }

  // 7. Check if there are pooler connection issues
  console.log('\n=== POOLER CONNECTION TEST ===');
  if (process.env.DATABASE_URL) {
    const testSql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 3 });
    try {
      const start = Date.now();
      const testResult = await testSql`SELECT 1 AS ok`;
      const elapsed = Date.now() - start;
      console.log('  Pooler OK - ' + elapsed + 'ms');
    } catch (e) {
      console.log('  *** POOLER FAILED: ' + e.message + ' ***');
    } finally {
      await testSql.end();
    }
  }

  // 8. Check all users and their membership+role status
  console.log('\n=== ALL USERS: MEMBERSHIP + ROLE STATUS ===');
  const allUsers = await sql`
    SELECT u.id, u.email, u.auth_provider_id,
           m.id AS membership_id, m.status AS m_status,
           (SELECT COUNT(*) FROM role_assignments ra WHERE ra.user_id = u.id) AS role_count
    FROM users u
    LEFT JOIN memberships m ON m.user_id = u.id
    ORDER BY u.created_at DESC
  `;
  allUsers.forEach(u => {
    const hasAuth = u.auth_provider_id ? 'YES' : 'NO';
    const hasMembership = u.membership_id ? u.m_status : 'NONE';
    console.log('  ' + u.email + ' | auth=' + hasAuth + ' | membership=' + hasMembership + ' | roles=' + u.role_count);
  });

  await sql.end();
  console.log('\nDone.');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
