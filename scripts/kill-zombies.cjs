#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const postgres = require('postgres');

(async () => {
  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }
  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const zombies = await sql`
      SELECT pid,
             state,
             EXTRACT(EPOCH FROM (NOW() - state_change))::int AS dur_secs,
             LEFT(query, 80) AS q
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND backend_type = 'client backend'
        AND wait_event_type = 'Client'
        AND wait_event = 'ClientRead'
        AND NOW() - state_change > INTERVAL '60 seconds'
        AND query NOT ILIKE '%LISTEN%'
        AND query NOT ILIKE '%archive_mode%'
        AND query NOT ILIKE '%get_auth%'
        AND query NOT ILIKE '%pg_stat_wal_receiver%'
    `;
    console.log('Found', zombies.length, 'zombies:');
    for (const z of zombies) {
      console.log('  PID', z.pid, z.state, z.dur_secs + 's:', z.q);
      await sql`SELECT pg_terminate_backend(${z.pid})`;
      console.log('  -> killed');
    }
  } finally {
    await sql.end();
  }
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });
