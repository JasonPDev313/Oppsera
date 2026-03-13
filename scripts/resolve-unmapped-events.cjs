/**
 * Resolve non-actionable unmapped GL events.
 *
 * Marks events as resolved when they represent non-actionable conditions
 * (zero-dollar orders, error entity types, etc.) that will never have
 * a mapping and should not inflate the unmapped event count.
 *
 * Usage:
 *   node scripts/resolve-unmapped-events.cjs                  # full run
 *   node scripts/resolve-unmapped-events.cjs --dry-run        # preview only
 *   node scripts/resolve-unmapped-events.cjs --tenant <id>    # specific tenant
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) {
  console.error('ERROR: DATABASE_URL not set.');
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantIdx = args.indexOf('--tenant');
const specificTenant = tenantIdx >= 0 && args[tenantIdx + 1] ? args[tenantIdx + 1] : null;

// Entity types that are non-actionable — they represent errors or conditions
// that will never have a mapping, not actual missing mappings.
const NON_ACTIONABLE_TYPES = [
  'zero_dollar_order',
  'backfill_error',
  'gl_posting_gap',
  'permanent_void_error',
  'transient_void_error',
  'void_gl_missing',
  'void_gl_error',
  'reversal_no_original',
  'return_component_unenriched',
  'return_unmapped_remainder',
  'breaker_skip_summary',
  'invalid_ratio',
  'unhandled_error',   // transient errors (SAVEPOINT, timeout) — GL entry usually exists from retry
  'posting_error',     // old schema bugs now fixed — stale error records
];

async function main() {
  console.log(`=== Resolve Non-Actionable Unmapped Events ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // 1. Count by entity_type
  const tenantFilter = specificTenant ? sql`AND tenant_id = ${specificTenant}` : sql``;

  const counts = await sql`
    SELECT entity_type, COUNT(*)::int AS cnt
    FROM gl_unmapped_events
    WHERE resolved_at IS NULL
      ${tenantFilter}
    GROUP BY entity_type
    ORDER BY cnt DESC
  `;

  console.log('Unresolved events by type:');
  let totalNonActionable = 0;
  let totalActionable = 0;
  for (const row of counts) {
    const isNonActionable = NON_ACTIONABLE_TYPES.includes(row.entity_type);
    const tag = isNonActionable ? '  [WILL RESOLVE]' : '';
    console.log(`  ${row.entity_type}: ${row.cnt}${tag}`);
    if (isNonActionable) totalNonActionable += row.cnt;
    else totalActionable += row.cnt;
  }
  console.log(`\nTotal non-actionable: ${totalNonActionable}`);
  console.log(`Total actionable:     ${totalActionable}`);

  if (totalNonActionable === 0) {
    console.log('\nNothing to resolve.');
    await sql.end();
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would resolve the non-actionable events above.');
    await sql.end();
    return;
  }

  // 2. Resolve non-actionable events
  const result = await sql`
    UPDATE gl_unmapped_events
    SET resolved_at = NOW(),
        resolved_by = 'system',
        reason = CONCAT(reason, ' [auto-resolved: non-actionable entity type]')
    WHERE resolved_at IS NULL
      AND entity_type = ANY(${NON_ACTIONABLE_TYPES})
      ${tenantFilter}
  `;

  console.log(`\nResolved ${result.count} events.`);
  await sql.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
