const fs = require('fs');
const postgres = require('postgres');

const raw = fs.readFileSync('.env.vercel-prod', 'utf8');
const match = raw.match(/^DATABASE_URL="([^"]+)"/m);
if (!match) { console.log('DATABASE_URL not found'); process.exit(1); }

let url = match[1].replace(/\\n/g, '').trim();
const sql = postgres(url, { max: 1, idle_timeout: 5, prepare: false, connect_timeout: 15 });

(async () => {
  try {
    await sql`SET statement_timeout = '120s'`;

    // Get all production migrations
    const rows = await sql`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at, id
    `;

    console.log(`Production has ${rows.length} migration rows\n`);

    // Show timestamps grouped by batch (same created_at = same migrate run)
    const batches = new Map();
    for (const r of rows) {
      const ts = r.created_at.toString();
      if (!batches.has(ts)) batches.set(ts, []);
      batches.get(ts).push(r);
    }

    console.log(`Applied in ${batches.size} batches:\n`);
    let cumulative = 0;
    for (const [ts, batchRows] of batches) {
      cumulative += batchRows.length;
      const date = new Date(Number(ts)).toISOString().replace('T', ' ').slice(0, 19);
      console.log(`  ${date}: ${batchRows.length} migrations (cumulative: ${cumulative})`);
    }

    // Check if local journal hashes match production hashes
    const journal = JSON.parse(fs.readFileSync('packages/db/migrations/meta/_journal.json', 'utf8'));
    const crypto = require('crypto');

    console.log('\n=== HASH COMPARISON ===');
    console.log('Checking if local migration file hashes appear in production...\n');

    const prodHashes = new Set(rows.map(r => r.hash));
    let matched = 0;
    let unmatched = 0;
    const unmatchedList = [];

    for (const entry of journal.entries) {
      const sqlFile = `packages/db/migrations/${entry.tag}.sql`;
      if (!fs.existsSync(sqlFile)) {
        console.log(`  ⚠️  File missing: ${sqlFile}`);
        continue;
      }
      const content = fs.readFileSync(sqlFile, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      if (prodHashes.has(hash)) {
        matched++;
      } else {
        unmatched++;
        unmatchedList.push(entry.tag);
      }
    }

    console.log(`  Matched: ${matched}/${journal.entries.length}`);
    console.log(`  Unmatched: ${unmatched}/${journal.entries.length}`);

    if (unmatchedList.length > 0 && unmatchedList.length <= 20) {
      console.log('\n  Unmatched migrations (hash not found in prod):');
      unmatchedList.forEach(t => console.log(`    - ${t}`));
    } else if (unmatchedList.length > 20) {
      console.log(`\n  First 20 unmatched:`);
      unmatchedList.slice(0, 20).forEach(t => console.log(`    - ${t}`));
      console.log(`    ... and ${unmatchedList.length - 20} more`);
    }

    // Extra prod hashes not in local
    const localHashes = new Set();
    for (const entry of journal.entries) {
      const sqlFile = `packages/db/migrations/${entry.tag}.sql`;
      if (fs.existsSync(sqlFile)) {
        const content = fs.readFileSync(sqlFile, 'utf8');
        localHashes.add(crypto.createHash('sha256').update(content).digest('hex'));
      }
    }
    const extraProd = rows.filter(r => !localHashes.has(r.hash));
    console.log(`\n  Production-only hashes (not in local files): ${extraProd.length}`);

    await sql.end();
  } catch (err) {
    console.error('Error:', err.message);
    try { await sql.end(); } catch {};
    process.exit(1);
  }
})();
