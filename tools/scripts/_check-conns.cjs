const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const sql = require('postgres')(process.env.DATABASE_URL, { max: 1, connect_timeout: 15 });

async function main() {
  const conns = await sql`
    SELECT state, count(*)::int as cnt
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state
    ORDER BY cnt DESC
  `;
  console.log('Connections by state:');
  for (const c of conns) console.log(' ', c.state || 'null', ':', c.cnt);

  const pending = await sql`SELECT count(*)::int as cnt FROM event_outbox WHERE published_at IS NULL`;
  console.log('\nPending outbox:', pending[0].cnt);

  await sql.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
