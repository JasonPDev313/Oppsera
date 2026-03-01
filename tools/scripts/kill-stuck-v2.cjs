const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env.remote') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
const postgres = require('postgres');

// Try direct connection (port 5432) for superuser access
const poolerUrl = process.env.DATABASE_URL;
// Convert pooler URL (port 6543) to direct (port 5432) for admin operations
const directUrl = poolerUrl ? poolerUrl.replace(':6543/', ':5432/') : null;

console.log('Pooler URL available:', Boolean(poolerUrl));
console.log('Trying direct connection (port 5432)...');

const url = directUrl || poolerUrl;
if (!url) { console.error('No DATABASE_URL found'); process.exit(1); }

const sql = postgres(url, { max: 1 });

(async () => {
  try {
    // Check current user
    const [me] = await sql`SELECT current_user as u, session_user as s`;
    console.log('Connected as:', me.u, '/ session:', me.s);

    // Show ALL connections
    const all = await sql`
      SELECT pid, state, wait_event, usename,
             extract(epoch from (now() - state_change))::int as idle_secs,
             LEFT(query, 120) as query_prefix
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
      ORDER BY state_change ASC
    `;
    console.log('\nAll connections:', all.length);
    for (const c of all) {
      console.log(`  PID ${c.pid} [${c.usename}] ${c.state}/${c.wait_event} ${c.idle_secs}s — ${c.query_prefix || '(empty)'}`);
    }

    // Kill stuck ones (idle + ClientRead > 10s, excluding system)
    const toKill = all.filter(c =>
      c.state === 'idle' &&
      c.wait_event === 'ClientRead' &&
      c.idle_secs > 10 &&
      !c.query_prefix?.includes('LISTEN') &&
      !c.query_prefix?.includes('archive_mode') &&
      !c.query_prefix?.includes('pgbouncer')
    );

    // Also kill idle-in-transaction
    const idleTx = all.filter(c => c.state === 'idle in transaction');

    const killList = [...toKill, ...idleTx];
    console.log('\nKilling', killList.length, 'stuck connections...');

    for (const c of killList) {
      try {
        await sql`SELECT pg_terminate_backend(${c.pid})`;
        console.log(`  Killed PID ${c.pid} [${c.usename}]`);
      } catch (e) {
        console.log(`  FAILED PID ${c.pid}: ${e.message}`);
      }
    }

    // Verify
    const after = await sql`
      SELECT state, wait_event, count(*) as cnt
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
      GROUP BY state, wait_event
    `;
    console.log('\nAfter cleanup:');
    for (const r of after) {
      console.log(`  ${r.state || 'null'}/${r.wait_event || 'null'}: ${r.cnt}`);
    }
  } finally {
    await sql.end();
  }
})();
