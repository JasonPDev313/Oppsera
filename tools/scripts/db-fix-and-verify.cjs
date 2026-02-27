const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });

async function fix() {
  // 1. Set project-level safety timeouts
  console.log('=== Setting project-level safety timeouts ===');
  try {
    await sql`ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s'`;
    console.log('  idle_in_transaction_session_timeout = 60s ✓');
  } catch (e) {
    console.log('  idle_in_transaction_session_timeout:', e.message);
  }
  try {
    await sql`ALTER DATABASE postgres SET statement_timeout = '30s'`;
    console.log('  statement_timeout = 30s ✓');
  } catch (e) {
    console.log('  statement_timeout:', e.message);
  }

  // 2. Kill ALL non-idle connections
  console.log('\n=== Killing all non-idle connections ===');
  const killed = await sql`
    SELECT pid, state, now() - state_change as duration, left(query, 100) as query,
           pg_terminate_backend(pid) as terminated
    FROM pg_stat_activity
    WHERE datname = 'postgres'
      AND state != 'idle'
      AND pid != pg_backend_pid()
    ORDER BY state_change ASC
  `;
  killed.forEach(row => {
    console.log('  Killed PID:', row.pid, '|', row.state, '|', String(row.duration).slice(0, 15));
  });
  if (killed.length === 0) console.log('  (none to kill)');

  // Wait for cleanup
  await new Promise(r => setTimeout(r, 3000));

  // 3. Verify clean state
  console.log('\n=== Post-fix status ===');
  const states = await sql`SELECT state, count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres' GROUP BY state ORDER BY cnt DESC`;
  console.log('Connection states:');
  states.forEach(row => console.log('  ', row.state || '(null)', ':', row.cnt));

  // 4. Verify settings applied
  console.log('\n=== Verify settings ===');
  const settings = await sql`
    SELECT name, setting, unit
    FROM pg_settings
    WHERE name IN ('idle_in_transaction_session_timeout', 'statement_timeout')
  `;
  settings.forEach(row => console.log('  ', row.name, '=', row.setting, row.unit || ''));

  // 5. Quick test that SELECT 1 works
  console.log('\n=== Quick health check ===');
  const start = Date.now();
  await sql`SELECT 1`;
  console.log('  SELECT 1 OK in', Date.now() - start, 'ms');

  await sql.end();
  console.log('\nDone! DB should be healthy now.');
}

fix().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
