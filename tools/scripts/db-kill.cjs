const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });

async function kill() {
  console.log('Terminating PID 502621 (stuck 1h53m)...');
  const r1 = await sql`SELECT pg_terminate_backend(502621)`;
  console.log('  Result:', r1[0]);

  console.log('Terminating PID 505918 (blocked 2m)...');
  const r2 = await sql`SELECT pg_terminate_backend(505918)`;
  console.log('  Result:', r2[0]);

  // Verify
  console.log('\nChecking remaining connections...');
  const states = await sql`SELECT state, count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres' GROUP BY state ORDER BY cnt DESC`;
  console.log('Connection states:');
  states.forEach(row => console.log('  ', row.state || '(null)', ':', row.cnt));

  const stuck = await sql`
    SELECT pid, state, now() - state_change as duration, left(query, 80) as query
    FROM pg_stat_activity
    WHERE datname = 'postgres' AND state != 'idle' AND pid != pg_backend_pid()
    ORDER BY state_change ASC
  `;
  if (stuck.length > 0) {
    console.log('\nRemaining non-idle:');
    stuck.forEach(row => console.log('  PID:', row.pid, '|', row.state, '|', row.duration));
  } else {
    console.log('\nAll clear - no stuck queries!');
  }

  await sql.end();
}

kill().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
