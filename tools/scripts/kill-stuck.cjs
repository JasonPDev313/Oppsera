const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env.remote') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
const postgres = require('postgres');

const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL found'); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });

(async () => {
  try {
    // Kill stuck ClientRead connections
    const stuck = await sql`
      SELECT pid, state, wait_event,
             extract(epoch from (now() - state_change))::int as idle_secs,
             LEFT(query, 100) as query_prefix,
             usename
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'idle'
        AND wait_event = 'ClientRead'
        AND now() - state_change > interval '10 seconds'
        AND query NOT LIKE '%LISTEN%'
        AND query NOT LIKE '%archive_mode%'
        AND query NOT LIKE '%pgbouncer%'
        AND usename NOT IN ('supabase_admin', 'postgres', 'supabase_auth_admin', 'supabase_storage_admin')
    `;
    console.log('Stuck ClientRead connections:', stuck.length);
    for (const s of stuck) {
      console.log(`  Killing PID ${s.pid} (idle ${s.idle_secs}s) — ${s.query_prefix}`);
      await sql`SELECT pg_terminate_backend(${s.pid})`;
    }

    // Check timeouts
    const [t1] = await sql`SHOW statement_timeout`;
    console.log('\nstatement_timeout:', t1.statement_timeout);
    const [t2] = await sql`SHOW idle_in_transaction_session_timeout`;
    console.log('idle_in_transaction_session_timeout:', t2.idle_in_transaction_session_timeout);

    // Check remaining connections
    const remaining = await sql`
      SELECT state, wait_event, count(*) as cnt
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
      GROUP BY state, wait_event
      ORDER BY cnt DESC
    `;
    console.log('\nRemaining connections after cleanup:');
    for (const r of remaining) {
      console.log(`  ${r.state || 'null'} / ${r.wait_event || 'null'}: ${r.cnt}`);
    }
  } finally {
    await sql.end();
  }
})();
