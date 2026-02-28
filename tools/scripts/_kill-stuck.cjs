const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL_ADMIN;
if (!url) { console.error('DATABASE_URL_ADMIN not set'); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });

async function run() {
  // Find stuck connections (active > 60s or idle in transaction > 30s)
  console.log('Finding stuck connections...');
  const stuck = await sql`
    SELECT pid, state,
           EXTRACT(EPOCH FROM age(clock_timestamp(), query_start))::int AS query_age_sec,
           EXTRACT(EPOCH FROM age(clock_timestamp(), state_change))::int AS state_age_sec,
           usename,
           LEFT(query, 100) AS query_preview
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND usename = 'postgres'
      AND (
        (state = 'active' AND age(clock_timestamp(), query_start) > interval '60 seconds')
        OR (state = 'idle in transaction' AND age(clock_timestamp(), state_change) > interval '30 seconds')
        OR (state = 'idle' AND age(clock_timestamp(), state_change) > interval '600 seconds' AND query LIKE '%event_outbox%')
      )
    ORDER BY query_start
  `;

  if (stuck.length === 0) {
    console.log('No stuck connections found!');
  } else {
    console.log('Found ' + stuck.length + ' stuck connections:');
    for (const c of stuck) {
      console.log('  pid=' + c.pid + ' state=' + c.state + ' age=' + c.query_age_sec + 's query=' + (c.query_preview || '(empty)'));
    }

    // Kill them
    console.log('\nKilling stuck connections...');
    for (const c of stuck) {
      try {
        await sql`SELECT pg_terminate_backend(${c.pid})`;
        console.log('  Killed pid=' + c.pid);
      } catch (e) {
        console.log('  Failed to kill pid=' + c.pid + ': ' + e.message);
      }
    }
  }

  // Check max connections vs current
  console.log('\n=== CONNECTION CAPACITY ===');
  const maxConns = await sql`SELECT setting::int AS max FROM pg_settings WHERE name = 'max_connections'`;
  const currentConns = await sql`SELECT count(*)::int AS cnt FROM pg_stat_activity WHERE datname = current_database()`;
  console.log('  Max connections: ' + maxConns[0].max);
  console.log('  Current connections: ' + currentConns[0].cnt);

  // After killing, verify remaining connections
  console.log('\n=== REMAINING CONNECTIONS ===');
  const remaining = await sql`
    SELECT pid, state, usename,
           EXTRACT(EPOCH FROM age(clock_timestamp(), query_start))::int AS age_sec,
           LEFT(query, 80) AS query_preview
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    ORDER BY state_change DESC
  `;
  remaining.forEach(c => {
    console.log('  pid=' + c.pid + ' state=' + (c.state || 'null') + ' user=' + c.usename + ' age=' + (c.age_sec || 'n/a') + 's');
  });

  // Test the exact query that my-roles uses
  console.log('\n=== TEST: my-roles query via pooler ===');
  const poolUrl = process.env.DATABASE_URL;
  if (poolUrl) {
    const poolSql = postgres(poolUrl, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
    try {
      const start = Date.now();
      // Get JP's user ID and tenant ID first
      const jpInfo = await sql`
        SELECT u.id AS user_id, m.tenant_id
        FROM users u
        JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
        WHERE u.email = 'jp@jasonpearsall.com'
        LIMIT 1
      `;
      if (jpInfo.length === 0) {
        console.log('  JP user not found');
      } else {
        const { user_id, tenant_id } = jpInfo[0];
        // Run the EXACT same query that getUserRoleAssignments uses
        const roles = await poolSql`
          SELECT
            ra.id AS assignment_id,
            r.id AS role_id,
            r.name AS role_name,
            r.is_system,
            ra.location_id,
            l.name AS location_name
          FROM role_assignments ra
          JOIN roles r ON r.id = ra.role_id
          LEFT JOIN locations l ON l.id = ra.location_id
          WHERE ra.tenant_id = ${tenant_id}
            AND ra.user_id = ${user_id}
          ORDER BY r.name
        `;
        const elapsed = Date.now() - start;
        console.log('  Query returned ' + roles.length + ' roles in ' + elapsed + 'ms');
        roles.forEach(r => {
          console.log('    role=' + r.role_name + ' system=' + r.is_system + ' location=' + (r.location_name || '(tenant-wide)'));
        });
      }
    } catch (e) {
      console.log('  *** POOLER QUERY FAILED: ' + e.message + ' ***');
    } finally {
      await poolSql.end();
    }
  }

  // Test the full middleware chain: authenticate query
  console.log('\n=== TEST: authenticate (validateToken) query via pooler ===');
  if (poolUrl) {
    const poolSql2 = postgres(poolUrl, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
    try {
      const start = Date.now();
      const jpAuthId = '8b9a96e0-c85c-4cf5-a922-2bfc04268fd6'; // JP's auth_provider_id
      const authResult = await poolSql2`
        SELECT u.id, u.email, u.name, u.auth_provider_id,
               m.tenant_id, m.status AS membership_status,
               t.name AS tenant_name, t.status AS tenant_status
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
        LEFT JOIN tenants t ON t.id = m.tenant_id
        WHERE u.auth_provider_id = ${jpAuthId}
        LIMIT 1
      `;
      const elapsed = Date.now() - start;
      if (authResult.length === 0) {
        console.log('  *** AUTH QUERY RETURNED EMPTY - this would cause auth failure ***');
      } else {
        const a = authResult[0];
        console.log('  Auth OK in ' + elapsed + 'ms: email=' + a.email + ' tenant=' + (a.tenant_id || 'NULL'));
      }
    } catch (e) {
      console.log('  *** AUTH QUERY FAILED: ' + e.message + ' ***');
    } finally {
      await poolSql2.end();
    }
  }

  await sql.end();
  console.log('\nDone.');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
