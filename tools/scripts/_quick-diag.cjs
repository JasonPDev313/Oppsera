const dotenv = require('dotenv');
dotenv.config({ path: '.env.vercel-prod' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, prepare: false });

(async () => {
  try {
    const r1 = await sql`SHOW statement_timeout`;
    console.log('statement_timeout:', r1[0].statement_timeout);
    const r2 = await sql`SHOW idle_in_transaction_session_timeout`;
    console.log('idle_in_tx_timeout:', r2[0].idle_in_transaction_session_timeout);

    const conns = await sql`
      SELECT pid, state, wait_event_type, wait_event,
             EXTRACT(EPOCH FROM (NOW() - state_change))::int as idle_seconds,
             LEFT(query, 150) as query
      FROM pg_stat_activity
      WHERE datname = 'postgres'
        AND pid != pg_backend_pid()
        AND state IS NOT NULL
      ORDER BY state_change ASC
    `;
    console.log('\nAll connections (' + conns.length + '):');
    for (const c of conns) {
      console.log(`  PID ${c.pid}: ${c.state} for ${c.idle_seconds}s | ${c.wait_event_type}/${c.wait_event} | ${(c.query || '').substring(0, 100)}`);
    }

    // Kill any connections idle > 120s that aren't system
    const stuck = conns.filter(c =>
      c.idle_seconds > 120 &&
      c.state === 'idle' &&
      c.wait_event === 'ClientRead' &&
      !c.query.includes('LISTEN') &&
      !c.query.includes('archive_mode') &&
      !c.query.includes('get_auth')
    );
    if (stuck.length > 0) {
      console.log('\nKilling ' + stuck.length + ' stuck connections:');
      for (const c of stuck) {
        console.log(`  Killing PID ${c.pid} (idle ${c.idle_seconds}s): ${(c.query || '').substring(0, 60)}`);
        await sql`SELECT pg_terminate_backend(${c.pid})`;
      }
    } else {
      console.log('\nNo stuck connections to kill.');
    }

    // Also kill any that have statement_timeout SET commands (leaked config)
    const leaked = conns.filter(c =>
      c.query && c.query.includes('statement_timeout') && c.idle_seconds > 30
    );
    if (leaked.length > 0) {
      console.log('\nKilling ' + leaked.length + ' leaked SET statement_timeout connections:');
      for (const c of leaked) {
        console.log(`  Killing PID ${c.pid}`);
        await sql`SELECT pg_terminate_backend(${c.pid})`;
      }
    }

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await sql.end();
    process.exit(0);
  }
})();
