/**
 * Bulk-resolve ALL remaining unmapped GL events.
 * Use when mappings have been fixed and stale unmapped records should be cleared.
 *
 * Usage:  node scripts/bulk-resolve-unmapped.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) { console.error('ERROR: DATABASE_URL not set.'); process.exit(1); }
const sql = postgres(connStr, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

async function main() {
  // Show what we're resolving
  const rows = await sql`
    SELECT id, tenant_id, event_type, entity_type, entity_id, reason, created_at
    FROM gl_unmapped_events
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
  `;
  console.log(`Found ${rows.length} unresolved event(s):`);
  for (const r of rows) {
    console.log(`  ${r.entity_type} / ${r.entity_id} — ${r.reason} (${r.created_at})`);
  }

  if (rows.length === 0) {
    console.log('Nothing to resolve.');
    await sql.end();
    return;
  }

  // Resolve all
  const result = await sql`
    UPDATE gl_unmapped_events
    SET resolved_at = NOW(),
        resolved_by = 'system',
        resolution_method = 'manual',
        reason = CONCAT(reason, ' [bulk-resolved: mappings now configured]')
    WHERE resolved_at IS NULL
  `;
  console.log(`\nResolved ${result.count} event(s).`);

  // Verify
  const remaining = await sql`
    SELECT COUNT(*)::int AS cnt FROM gl_unmapped_events WHERE resolved_at IS NULL
  `;
  console.log(`Remaining unresolved: ${remaining[0].cnt}`);

  await sql.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
