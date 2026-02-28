const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const sql = require('postgres')(process.env.DATABASE_URL, { max: 1, connect_timeout: 15 });

async function main() {
  const rows = await sql`
    SELECT pid, state, usename, application_name,
           EXTRACT(epoch FROM (now() - state_change))::int as seconds_in_state,
           EXTRACT(epoch FROM (now() - backend_start))::int as age_seconds,
           wait_event_type, wait_event,
           LEFT(query, 100) as query_preview
    FROM pg_stat_activity
    WHERE datname = current_database()
    ORDER BY state_change DESC
  `;

  console.log('=== All DB Connections ===');
  for (const r of rows) {
    const wait = r.wait_event_type ? `${r.wait_event_type}/${r.wait_event}` : '-';
    console.log(`  PID ${r.pid} | ${r.state || 'null'} | ${r.seconds_in_state}s in state | conn age ${r.age_seconds}s | wait: ${wait}`);
    console.log(`    user=${r.usename} app=${r.application_name}`);
    if (r.query_preview) console.log(`    query: ${r.query_preview}`);
    console.log();
  }

  // Check max connections setting
  const maxConn = await sql`SHOW max_connections`;
  console.log('Max connections:', maxConn[0].max_connections);

  // Check Supavisor/pgBouncer pool usage
  const poolStats = await sql`
    SELECT count(*)::int as total,
           count(*) FILTER (WHERE state = 'active')::int as active,
           count(*) FILTER (WHERE state = 'idle')::int as idle,
           count(*) FILTER (WHERE state = 'idle in transaction')::int as idle_in_tx,
           count(*) FILTER (WHERE state IS NULL)::int as null_state
    FROM pg_stat_activity
    WHERE datname = current_database()
  `;
  console.log('Pool summary:', poolStats[0]);

  await sql.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
