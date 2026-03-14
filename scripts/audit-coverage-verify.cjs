const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  const from = '2026-02-12';
  const to = '2026-03-14';

  // Replicate the exact audit coverage query logic
  const [orderCount, tenderCount, glCount, orderAudit, tenderAudit, glAudit] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM orders WHERE status IN ('placed', 'paid', 'voided') AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
    sql`SELECT COUNT(*)::int AS count FROM tenders WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
    sql`SELECT COUNT(*)::int AS count FROM gl_journal_entries WHERE status = 'posted' AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
    sql`SELECT COUNT(*)::int AS count FROM audit_log WHERE action LIKE 'order.%' AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
    sql`SELECT COUNT(*)::int AS count FROM audit_log WHERE (action LIKE 'payment.%' OR action LIKE 'tender.%') AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
    sql`SELECT COUNT(*)::int AS count FROM audit_log WHERE action LIKE 'accounting.%' AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz`,
  ]);

  console.log('=== Coverage Comparison (same logic as dashboard) ===');
  console.log(`GL:      ${glCount[0].count} entries, ${glAudit[0].count} audit → ${Math.round(Math.min(glAudit[0].count, glCount[0].count) / glCount[0].count * 100)}%`);
  console.log(`Tenders: ${tenderCount[0].count} tenders, ${tenderAudit[0].count} audit → ${tenderCount[0].count > 0 ? Math.round(Math.min(tenderAudit[0].count, tenderCount[0].count) / tenderCount[0].count * 100) : 100}%`);
  console.log(`Orders:  ${orderCount[0].count} orders, ${orderAudit[0].count} audit → ${orderCount[0].count > 0 ? Math.round(Math.min(orderAudit[0].count, orderCount[0].count) / orderCount[0].count * 100) : 100}%`);

  // Check: the coverage query uses tenant_id filter — get the tenant
  const tenants = await sql`SELECT DISTINCT tenant_id, COUNT(*)::int AS cnt FROM orders WHERE status IN ('placed', 'paid', 'voided') AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz GROUP BY tenant_id`;
  console.log('\n=== Orders by Tenant ===');
  for (const r of tenants) {
    console.log(`  ${r.tenant_id}: ${r.cnt} orders`);
  }

  // Note: the dashboard filters by tenant_id but these counts are global
  // The dashboard number of 22,736 for orders might be from a different date range

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
