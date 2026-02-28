const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

(async () => {
  try {
    // Recent order events in outbox
    const events = await sql`
      SELECT id, event_type, event_id, published_at, created_at
      FROM event_outbox
      WHERE event_type LIKE 'order%'
      ORDER BY created_at DESC LIMIT 10
    `;
    console.log('=== Recent order events in outbox ===');
    if (events.length === 0) console.log('  (none)');
    for (const e of events) {
      console.log('  ' + e.event_type + ' | published=' + e.published_at + ' | created=' + e.created_at);
    }

    // Unpublished events
    const unpub = await sql`
      SELECT event_type, COUNT(*) as cnt
      FROM event_outbox
      WHERE published_at IS NULL
      GROUP BY event_type
      ORDER BY cnt DESC
    `;
    console.log('\n=== Unpublished events by type ===');
    if (unpub.length === 0) console.log('  (none - all published)');
    for (const u of unpub) {
      console.log('  ' + u.event_type + ': ' + u.cnt);
    }

    // Total stats
    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE published_at IS NOT NULL) as published,
        COUNT(*) FILTER (WHERE published_at IS NULL) as unpublished
      FROM event_outbox
    `;
    console.log('\n=== Outbox stats ===');
    console.log('  Total: ' + stats[0].total);
    console.log('  Published: ' + stats[0].published);
    console.log('  Unpublished: ' + stats[0].unpublished);

    // Check dead letters
    const dlq = await sql`
      SELECT event_type, error_message, created_at
      FROM event_dead_letters
      WHERE event_type LIKE 'order%'
      ORDER BY created_at DESC LIMIT 5
    `;
    console.log('\n=== Dead letter order events ===');
    if (dlq.length === 0) console.log('  (none)');
    for (const d of dlq) {
      console.log('  ' + d.event_type + ' | error=' + (d.error_message || '').substring(0, 120) + ' | ' + d.created_at);
    }

    await sql.end();
  } catch(e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
  }
})();
