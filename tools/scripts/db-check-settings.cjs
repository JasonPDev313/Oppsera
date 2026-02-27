const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });

async function main() {
  // Check database-level settings
  const settings = await sql`
    SELECT name, setting, unit
    FROM pg_settings
    WHERE name IN (
      'statement_timeout',
      'idle_in_transaction_session_timeout',
      'lock_timeout'
    )
  `;
  console.log('Database-level settings:');
  for (const s of settings) {
    console.log(`  ${s.name} = ${s.setting} ${s.unit || ''}`);
  }

  // Check outbox stats
  const pending = await sql`
    SELECT COUNT(*) as cnt FROM event_outbox WHERE published_at IS NULL
  `;
  console.log(`\nPending outbox events: ${pending[0].cnt}`);

  const claimed = await sql`
    SELECT COUNT(*) as cnt FROM event_outbox
    WHERE published_at IS NOT NULL
  `;
  console.log(`Claimed outbox events: ${claimed[0].cnt}`);

  const stale = await sql`
    SELECT COUNT(*) as cnt FROM event_outbox
    WHERE published_at IS NOT NULL
    AND published_at < NOW() - INTERVAL '5 minutes'
  `;
  console.log(`Stale claimed (>5 min): ${stale[0].cnt}`);

  // Find connections stuck >30s
  const stuck = await sql`
    SELECT pid, state, now() - state_change as duration,
           LEFT(query, 100) as query_prefix
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND state != 'idle'
    AND now() - state_change > INTERVAL '30 seconds'
    AND pid != pg_backend_pid()
  `;
  console.log(`\nConnections active >30s: ${stuck.length}`);
  for (const c of stuck) {
    console.log(`  PID ${c.pid}: ${c.state} for ${c.duration} — ${c.query_prefix}`);
  }

  // Kill stuck connections >60s
  if (stuck.length > 0) {
    console.log('\nKilling stuck connections...');
    for (const c of stuck) {
      const killed = await sql`SELECT pg_terminate_backend(${c.pid})`;
      console.log(`  PID ${c.pid}: terminated = ${killed[0].pg_terminate_backend}`);
    }
  }

  // Reset stale claims
  const resetStale = await sql`
    UPDATE event_outbox
    SET published_at = NULL
    WHERE published_at IS NOT NULL
    AND published_at < NOW() - INTERVAL '5 minutes'
    AND id NOT IN (
      SELECT DISTINCT event_id FROM processed_events WHERE event_id IS NOT NULL
    )
  `;
  console.log(`\nReset ${resetStale.count} stale claimed events for reprocessing`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
