/**
 * Backfill audit_log entries for transactions that are missing them.
 *
 * Creates synthetic audit entries for:
 *   - GL journal entries (posted) without a corresponding accounting.% audit entry
 *   - Orders (placed/paid/voided) without a corresponding order.% audit entry
 *   - Tenders without a corresponding tender.%/payment.% audit entry
 *
 * Usage:
 *   node scripts/backfill-audit-entries.cjs                  # full run
 *   node scripts/backfill-audit-entries.cjs --dry-run        # preview only
 *   node scripts/backfill-audit-entries.cjs --from 2026-02-12 --to 2026-03-13
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const { ulid } = require('ulid');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) { console.error('ERROR: DATABASE_URL not set.'); process.exit(1); }
const sql = postgres(connStr, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');
const fromDate = fromIdx >= 0 && args[fromIdx + 1] ? args[fromIdx + 1] : '2026-02-12';
const toDate = toIdx >= 0 && args[toIdx + 1] ? args[toIdx + 1] : '2026-03-14';

const BATCH_SIZE = 500;

async function backfillCategory(label, query, actionFn, entityTypeFn, entityIdFn) {
  console.log(`\n--- ${label} ---`);
  const missing = await query;
  console.log(`  Found ${missing.length} transactions without audit entries`);

  if (missing.length === 0 || dryRun) {
    if (dryRun && missing.length > 0) {
      console.log(`  [DRY RUN] Would create ${missing.length} audit entries`);
    }
    return missing.length;
  }

  let inserted = 0;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const values = batch.map(r => ({
      id: ulid(),
      tenant_id: r.tenant_id,
      location_id: r.location_id || null,
      actor_user_id: r.actor_id || 'system',
      actor_type: r.actor_id ? 'user' : 'system',
      action: actionFn(r),
      entity_type: entityTypeFn(r),
      entity_id: entityIdFn(r),
      metadata: JSON.stringify({ backfilled: true, originalCreatedAt: r.created_at }),
      created_at: r.created_at,
    }));

    await sql`
      INSERT INTO audit_log ${sql(values, 'id', 'tenant_id', 'location_id', 'actor_user_id', 'actor_type', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at')}
    `;
    inserted += batch.length;
    if (inserted % 2000 === 0 || i + BATCH_SIZE >= missing.length) {
      console.log(`  Inserted ${inserted}/${missing.length}`);
    }
  }

  return inserted;
}

async function main() {
  console.log(`=== Backfill Audit Entries ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Date range: ${fromDate} to ${toDate}\n`);

  let totalInserted = 0;

  // 1. GL Journal Entries without accounting.% audit entries
  const glInserted = await backfillCategory(
    'GL Journal Entries',
    sql`
      SELECT je.id, je.tenant_id, NULL AS location_id, je.created_by AS actor_id, je.created_at, je.source_module
      FROM gl_journal_entries je
      WHERE je.status = 'posted'
        AND je.created_at >= ${fromDate}::timestamptz
        AND je.created_at < ${toDate}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = je.id
            AND al.action LIKE 'accounting.%'
            AND al.tenant_id = je.tenant_id
        )
      ORDER BY je.created_at
    `,
    (r) => 'accounting.journal.posted',
    (r) => 'gl_journal_entry',
    (r) => r.id,
  );
  totalInserted += glInserted;

  // 2. Orders without order.% audit entries
  const orderInserted = await backfillCategory(
    'Orders',
    sql`
      SELECT o.id, o.tenant_id, o.location_id, o.created_by AS actor_id, o.created_at, o.status
      FROM orders o
      WHERE o.status IN ('placed', 'paid', 'voided')
        AND o.created_at >= ${fromDate}::timestamptz
        AND o.created_at < ${toDate}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = o.id
            AND al.action LIKE 'order.%'
            AND al.tenant_id = o.tenant_id
        )
      ORDER BY o.created_at
    `,
    (r) => r.status === 'voided' ? 'order.voided' : 'order.placed',
    (r) => 'order',
    (r) => r.id,
  );
  totalInserted += orderInserted;

  // 3. Tenders without tender.%/payment.% audit entries
  const tenderInserted = await backfillCategory(
    'Tenders',
    sql`
      SELECT t.id, t.tenant_id, t.location_id, t.created_at, t.order_id
      FROM tenders t
      WHERE t.created_at >= ${fromDate}::timestamptz
        AND t.created_at < ${toDate}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = t.order_id
            AND (al.action LIKE 'tender.%' OR al.action LIKE 'payment.%')
            AND al.tenant_id = t.tenant_id
        )
      ORDER BY t.created_at
    `,
    (r) => 'tender.recorded',
    (r) => 'order',
    (r) => r.order_id || r.id,
  );
  totalInserted += tenderInserted;

  console.log(`\n=== Summary ===`);
  console.log(`Total backfilled: ${totalInserted} audit entries`);

  await sql.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
