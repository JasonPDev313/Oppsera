const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
console.log('Connecting to:', url.replace(/:[^:@]+@/, ':***@'));

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });

async function check() {
  const start = Date.now();

  const test = await sql`SELECT 1 as test`;
  console.log('DB OK:', test[0], 'in', Date.now() - start, 'ms');

  const conns = await sql`SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres'`;
  console.log('Total connections:', conns[0].cnt);

  const states = await sql`SELECT state, count(*) as cnt FROM pg_stat_activity WHERE datname = 'postgres' GROUP BY state ORDER BY cnt DESC`;
  console.log('Connection states:');
  states.forEach(row => console.log('  ', row.state || '(null)', ':', row.cnt));

  const stuck = await sql`
    SELECT pid, state, wait_event_type, wait_event,
           now() - state_change as duration,
           left(query, 80) as query
    FROM pg_stat_activity
    WHERE datname = 'postgres'
      AND state != 'idle'
      AND pid != pg_backend_pid()
    ORDER BY state_change ASC
    LIMIT 20
  `;

  if (stuck.length > 0) {
    console.log('\nNon-idle connections:');
    stuck.forEach(row => {
      console.log('  PID:', row.pid, '| State:', row.state, '| Duration:', row.duration, '| Wait:', row.wait_event_type, row.wait_event);
      console.log('    Query:', row.query);
    });
  } else {
    console.log('\nNo stuck queries found.');
  }

  await sql.end();
}

check().catch(e => {
  console.error('DB ERROR:', e.message);
  process.exit(1);
});
