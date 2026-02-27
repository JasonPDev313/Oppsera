const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });

async function killAll() {
  // Kill ALL non-idle connections except our own
  console.log('Killing all non-idle connections...');
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
    console.log('  Killed PID:', row.pid, '|', row.state, '|', String(row.duration).slice(0, 15), '| terminated:', row.terminated);
    console.log('    Query:', row.query);
  });
  if (killed.length === 0) console.log('  (none found)');

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Full status after cleanup
  console.log('\n--- Post-cleanup status ---');
  const states = await sql`SELECT state, count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres' GROUP BY state ORDER BY cnt DESC`;
  console.log('Connection states:');
  states.forEach(row => console.log('  ', row.state || '(null)', ':', row.cnt));

  const total = await sql`SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres'`;
  console.log('Total connections:', total[0].cnt);

  // Check for any long-running idle connections too
  const idle = await sql`
    SELECT pid, state, now() - state_change as duration, usename, application_name
    FROM pg_stat_activity
    WHERE datname = 'postgres'
      AND pid != pg_backend_pid()
    ORDER BY state_change ASC
  `;
  console.log('\nAll remaining connections:');
  idle.forEach(row => {
    console.log('  PID:', row.pid, '|', row.state, '|', String(row.duration).slice(0, 15), '| user:', row.usename, '| app:', row.application_name);
  });

  await sql.end();
}

killAll().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
