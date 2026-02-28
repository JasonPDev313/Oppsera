const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    // Check event_outbox columns
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'event_outbox' ORDER BY ordinal_position
    `;
    console.log('=== event_outbox columns ===');
    for (const c of cols) console.log('  ' + c.column_name);

    // Check recent order events in outbox
    const events = await sql`
      SELECT id, event_type, processed_at, created_at, claimed_at
      FROM event_outbox
      WHERE event_type LIKE 'order%'
      ORDER BY created_at DESC LIMIT 10
    `;
    console.log('\n=== Recent order events in outbox ===');
    if (events.length === 0) console.log('  (none)');
    for (const e of events) {
      console.log('  ' + e.event_type + ' | processed=' + e.processed_at + ' | claimed=' + e.claimed_at + ' | created=' + e.created_at);
    }

    // Check for stuck/unprocessed events
    const stuck = await sql`
      SELECT event_type, COUNT(*) as cnt
      FROM event_outbox
      WHERE processed_at IS NULL
      GROUP BY event_type
      ORDER BY cnt DESC
    `;
    console.log('\n=== Unprocessed events by type ===');
    if (stuck.length === 0) console.log('  (none - all processed)');
    for (const s of stuck) {
      console.log('  ' + s.event_type + ': ' + s.cnt);
    }

    // Check total outbox stats
    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
        COUNT(*) FILTER (WHERE processed_at IS NULL) as unprocessed,
        COUNT(*) FILTER (WHERE claimed_at IS NOT NULL AND processed_at IS NULL) as claimed_not_processed
      FROM event_outbox
    `;
    console.log('\n=== Outbox stats ===');
    console.log('  Total: ' + stats[0].total);
    console.log('  Processed: ' + stats[0].processed);
    console.log('  Unprocessed: ' + stats[0].unprocessed);
    console.log('  Claimed but not processed: ' + stats[0].claimed_not_processed);

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
