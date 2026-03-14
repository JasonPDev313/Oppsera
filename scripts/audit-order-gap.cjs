const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  const from = '2026-02-12';
  const to = '2026-03-14';

  // How many orders have audit entries (any date) vs in-range audit entries?
  const [withAnyAudit, withRangeAudit, totalOrders, orderSample] = await Promise.all([
    sql`
      SELECT COUNT(DISTINCT o.id)::int AS count
      FROM orders o
      WHERE o.status IN ('placed', 'paid', 'voided')
        AND o.created_at >= ${from}::timestamptz
        AND o.created_at < ${to}::timestamptz
        AND EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = o.id AND al.action LIKE 'order.%'
        )
    `,
    sql`
      SELECT COUNT(DISTINCT o.id)::int AS count
      FROM orders o
      WHERE o.status IN ('placed', 'paid', 'voided')
        AND o.created_at >= ${from}::timestamptz
        AND o.created_at < ${to}::timestamptz
        AND EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = o.id AND al.action LIKE 'order.%'
            AND al.created_at >= ${from}::timestamptz
            AND al.created_at < ${to}::timestamptz
        )
    `,
    sql`
      SELECT COUNT(*)::int AS count FROM orders
      WHERE status IN ('placed', 'paid', 'voided')
        AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
    `,
    // Sample orders without in-range audit entries
    sql`
      SELECT o.id, o.status, o.source, o.created_at, o.created_by
      FROM orders o
      WHERE o.status IN ('placed', 'paid', 'voided')
        AND o.created_at >= ${from}::timestamptz
        AND o.created_at < ${to}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_id = o.id AND al.action LIKE 'order.%'
            AND al.created_at >= ${from}::timestamptz
            AND al.created_at < ${to}::timestamptz
        )
      ORDER BY o.created_at DESC
      LIMIT 5
    `,
  ]);

  console.log(`Total orders in range: ${totalOrders[0].count}`);
  console.log(`Orders with ANY audit entry: ${withAnyAudit[0].count}`);
  console.log(`Orders with in-range audit entry: ${withRangeAudit[0].count}`);
  console.log(`Orders missing in-range audit: ${totalOrders[0].count - withRangeAudit[0].count}`);

  console.log('\nSample orders without in-range audit:');
  for (const r of orderSample) {
    // Check if they have out-of-range audit entries
    const auditEntries = await sql`
      SELECT action, created_at FROM audit_log
      WHERE entity_id = ${r.id} AND action LIKE 'order.%'
      ORDER BY created_at
    `;
    console.log(`  ${r.id} | ${r.source} | ${r.status} | order.created_at: ${r.created_at} | created_by: ${r.created_by}`);
    if (auditEntries.length > 0) {
      for (const a of auditEntries) {
        console.log(`    audit: ${a.action} at ${a.created_at}`);
      }
    } else {
      console.log(`    NO audit entries at all`);
    }
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
