const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });

async function main() {
  // Check ALL connections
  const conns = await sql`
    SELECT pid, state, now() - state_change as duration,
           wait_event_type, wait_event,
           LEFT(query, 250) as query_prefix
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND pid != pg_backend_pid()
    ORDER BY state_change ASC
  `;
  console.log('All connections (' + conns.length + '):');
  for (const c of conns) {
    console.log('  PID ' + c.pid + ': ' + c.state + ' for ' + c.duration + ' wait=' + (c.wait_event_type || 'none') + '/' + (c.wait_event || 'none'));
    console.log('    ' + c.query_prefix);
    console.log();
  }

  // Check if semantic_lenses has RLS issues
  const rls = await sql`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as qual
    FROM pg_policy
    WHERE polrelid = 'semantic_lenses'::regclass
  `;
  console.log('\nRLS policies on semantic_lenses:');
  for (const p of rls) {
    console.log('  ' + p.polname + ' (' + p.polcmd + '): ' + p.qual);
  }

  // Check table size
  const size = await sql`SELECT count(*) as cnt FROM semantic_lenses`;
  console.log('\nsemantic_lenses rows: ' + size[0].cnt);

  // Check for blocked locks
  const locks = await sql`
    SELECT l.pid, l.locktype, l.mode, l.granted, l.relation::regclass as table_name
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE a.datname = current_database()
    AND NOT l.granted
  `;
  console.log('\nBlocked locks: ' + locks.length);
  for (const lk of locks) {
    console.log('  PID ' + lk.pid + ': ' + lk.locktype + ' ' + lk.mode + ' on ' + lk.table_name);
  }

  // Check idle-in-transaction connections specifically
  const idleTx = await sql`
    SELECT pid, state, now() - xact_start as tx_duration,
           now() - state_change as state_duration,
           LEFT(query, 200) as query_prefix
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND state = 'idle in transaction'
    AND pid != pg_backend_pid()
  `;
  console.log('\nIdle-in-transaction connections: ' + idleTx.length);
  for (const c of idleTx) {
    console.log('  PID ' + c.pid + ': tx=' + c.tx_duration + ' state=' + c.state_duration);
    console.log('    ' + c.query_prefix);
  }

  // Connection summary
  const poolStats = await sql`
    SELECT count(*) as total,
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle,
           count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx,
           count(*) FILTER (WHERE wait_event_type = 'Client' AND wait_event = 'ClientRead') as client_read
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND pid != pg_backend_pid()
  `;
  console.log('\nConnection summary:');
  const s = poolStats[0];
  console.log('  Total: ' + s.total + ', Active: ' + s.active + ', Idle: ' + s.idle + ', Idle-in-tx: ' + s.idle_in_tx + ', ClientRead: ' + s.client_read);

  // Kill any stuck active connections (>30s)
  const stuck = await sql`
    SELECT pid, state, now() - state_change as duration
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND state != 'idle'
    AND now() - state_change > INTERVAL '30 seconds'
    AND pid != pg_backend_pid()
  `;
  if (stuck.length > 0) {
    console.log('\nKilling ' + stuck.length + ' stuck connections...');
    for (const c of stuck) {
      const killed = await sql`SELECT pg_terminate_backend(${c.pid})`;
      console.log('  PID ' + c.pid + ' (' + c.state + ', ' + c.duration + '): terminated=' + killed[0].pg_terminate_backend);
    }
  } else {
    console.log('\nNo stuck connections to kill.');
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
