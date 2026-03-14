/**
 * Debug audit coverage gaps on production.
 * Shows transaction counts vs audit_log entries by category and date.
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
  // 1. Overall audit_log stats
  const auditStats = await sql`
    SELECT action, COUNT(*)::int AS cnt
    FROM audit_log
    WHERE created_at >= '2026-02-12'::timestamptz
      AND created_at < '2026-03-14'::timestamptz
    GROUP BY action
    ORDER BY cnt DESC
    LIMIT 30
  `;
  console.log('=== Audit Log Actions (02/12 - 03/13) ===');
  let totalAudit = 0;
  for (const r of auditStats) {
    console.log(`  ${r.action}: ${r.cnt}`);
    totalAudit += r.cnt;
  }
  console.log(`  TOTAL: ${totalAudit}\n`);

  // 2. Orders by date (last 7 days) — do they have audit entries?
  const ordersByDate = await sql`
    SELECT
      o.dt,
      o.order_count,
      COALESCE(a.audit_count, 0) AS audit_count
    FROM (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS order_count
      FROM orders
      WHERE status IN ('placed', 'paid', 'voided')
        AND created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) o
    LEFT JOIN (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS audit_count
      FROM audit_log
      WHERE action LIKE 'order.%'
        AND created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) a ON o.dt = a.dt
    ORDER BY o.dt DESC
  `;
  console.log('=== Orders vs Audit Entries (last 7 days) ===');
  for (const r of ordersByDate) {
    const pct = r.order_count > 0 ? Math.round(r.audit_count / r.order_count * 100) : 0;
    console.log(`  ${r.dt}: ${r.order_count} orders, ${r.audit_count} audit entries (${pct}%)`);
  }

  // 3. Tenders by date
  const tendersByDate = await sql`
    SELECT
      t.dt,
      t.tender_count,
      COALESCE(a.audit_count, 0) AS audit_count
    FROM (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS tender_count
      FROM tenders
      WHERE created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) t
    LEFT JOIN (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS audit_count
      FROM audit_log
      WHERE (action LIKE 'payment.%' OR action LIKE 'tender.%')
        AND created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) a ON t.dt = a.dt
    ORDER BY t.dt DESC
  `;
  console.log('\n=== Tenders vs Audit Entries (last 7 days) ===');
  for (const r of tendersByDate) {
    const pct = r.tender_count > 0 ? Math.round(r.audit_count / r.tender_count * 100) : 0;
    console.log(`  ${r.dt}: ${r.tender_count} tenders, ${r.audit_count} audit entries (${pct}%)`);
  }

  // 4. GL entries by date
  const glByDate = await sql`
    SELECT
      g.dt,
      g.gl_count,
      COALESCE(a.audit_count, 0) AS audit_count
    FROM (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS gl_count
      FROM gl_journal_entries
      WHERE status = 'posted'
        AND created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) g
    LEFT JOIN (
      SELECT DATE(created_at) AS dt, COUNT(*)::int AS audit_count
      FROM audit_log
      WHERE action LIKE 'accounting.%'
        AND created_at >= '2026-03-07'::timestamptz
        AND created_at < '2026-03-14'::timestamptz
      GROUP BY DATE(created_at)
    ) a ON g.dt = a.dt
    ORDER BY g.dt DESC
  `;
  console.log('\n=== GL Journal Entries vs Audit Entries (last 7 days) ===');
  for (const r of glByDate) {
    const pct = r.gl_count > 0 ? Math.round(r.audit_count / r.gl_count * 100) : 0;
    console.log(`  ${r.dt}: ${r.gl_count} GL entries, ${r.audit_count} audit entries (${pct}%)`);
  }

  // 5. Check when audit logging first appeared
  const firstAudit = await sql`
    SELECT MIN(created_at) AS first_entry, MAX(created_at) AS last_entry, COUNT(*)::int AS total
    FROM audit_log
  `;
  console.log('\n=== Audit Log Timeline ===');
  console.log(`  First entry: ${firstAudit[0].first_entry}`);
  console.log(`  Last entry:  ${firstAudit[0].last_entry}`);
  console.log(`  Total entries: ${firstAudit[0].total}`);

  // 6. Check deferred work failures in logs (if any error pattern)
  const recentErrors = await sql`
    SELECT action, COUNT(*)::int AS cnt
    FROM audit_log
    WHERE created_at >= '2026-03-12'::timestamptz
    GROUP BY action
    ORDER BY cnt DESC
    LIMIT 15
  `;
  console.log('\n=== Recent Audit Actions (Mar 12-13) ===');
  for (const r of recentErrors) {
    console.log(`  ${r.action}: ${r.cnt}`);
  }

  await sql.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
