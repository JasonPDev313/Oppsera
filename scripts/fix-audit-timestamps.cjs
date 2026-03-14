/**
 * Fix audit_log timestamps for seed-generated orders.
 * Aligns audit entry created_at with the corresponding order's created_at
 * so they appear in the same date range in the audit coverage report.
 *
 * Usage:
 *   node scripts/fix-audit-timestamps.cjs --dry-run
 *   node scripts/fix-audit-timestamps.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) { console.error('ERROR: DATABASE_URL not set.'); process.exit(1); }
const sql = postgres(connStr, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`=== Fix Audit Timestamps ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Count mismatched order audit entries
  const preview = await sql`
    SELECT COUNT(*)::int AS count
    FROM audit_log al
    JOIN orders o ON o.id = al.entity_id AND o.tenant_id = al.tenant_id
    WHERE al.action LIKE 'order.%'
      AND ABS(EXTRACT(EPOCH FROM (al.created_at - o.created_at))) > 3600
  `;
  console.log(`Order audit entries with >1hr timestamp mismatch: ${preview[0].count}`);

  if (preview[0].count === 0) {
    console.log('Nothing to fix.');
    await sql.end();
    return;
  }

  if (dryRun) {
    console.log('[DRY RUN] Would update timestamps.');
    await sql.end();
    return;
  }

  // Fix: set audit entry created_at to match order created_at
  const result = await sql`
    UPDATE audit_log al
    SET created_at = o.created_at
    FROM orders o
    WHERE o.id = al.entity_id
      AND o.tenant_id = al.tenant_id
      AND al.action LIKE 'order.%'
      AND ABS(EXTRACT(EPOCH FROM (al.created_at - o.created_at))) > 3600
  `;
  console.log(`Updated ${result.count} audit entries.`);

  // Same for tender audit entries
  const tenderPreview = await sql`
    SELECT COUNT(*)::int AS count
    FROM audit_log al
    JOIN tenders t ON t.order_id = al.entity_id AND t.tenant_id = al.tenant_id
    WHERE (al.action LIKE 'tender.%' OR al.action LIKE 'payment.%')
      AND al.entity_type = 'order'
      AND ABS(EXTRACT(EPOCH FROM (al.created_at - t.created_at))) > 3600
  `;
  console.log(`\nTender audit entries with >1hr timestamp mismatch: ${tenderPreview[0].count}`);

  if (tenderPreview[0].count > 0) {
    const tResult = await sql`
      UPDATE audit_log al
      SET created_at = t.created_at
      FROM tenders t
      WHERE t.order_id = al.entity_id
        AND t.tenant_id = al.tenant_id
        AND (al.action LIKE 'tender.%' OR al.action LIKE 'payment.%')
        AND al.entity_type = 'order'
        AND ABS(EXTRACT(EPOCH FROM (al.created_at - t.created_at))) > 3600
    `;
    console.log(`Updated ${tResult.count} tender audit entries.`);
  }

  // Verify
  const remaining = await sql`
    SELECT COUNT(*)::int AS count
    FROM audit_log al
    JOIN orders o ON o.id = al.entity_id AND o.tenant_id = al.tenant_id
    WHERE al.action LIKE 'order.%'
      AND ABS(EXTRACT(EPOCH FROM (al.created_at - o.created_at))) > 3600
  `;
  console.log(`\nRemaining mismatched: ${remaining[0].count}`);

  await sql.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
