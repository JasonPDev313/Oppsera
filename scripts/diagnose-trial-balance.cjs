/**
 * Diagnose Trial Balance Variance
 *
 * Finds unbalanced GL journal entries and identifies the source
 * of the trial balance discrepancy.
 *
 * Usage:
 *   node scripts/diagnose-trial-balance.cjs
 *   node scripts/diagnose-trial-balance.cjs --start 2026-03-01 --end 2026-03-13
 *   node scripts/diagnose-trial-balance.cjs --tenant <id>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');

const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) {
  console.error('ERROR: DATABASE_URL not set. Check .env.remote or .env.local');
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });

// ── CLI args ──
const args = process.argv.slice(2);
const startIdx = args.indexOf('--start');
const startDate = startIdx >= 0 && args[startIdx + 1] ? args[startIdx + 1] : '2026-03-01';
const endIdx = args.indexOf('--end');
const endDate = endIdx >= 0 && args[endIdx + 1] ? args[endIdx + 1] : '2026-03-13';
const tenantIdx = args.indexOf('--tenant');
const specificTenant = tenantIdx >= 0 && args[tenantIdx + 1] ? args[tenantIdx + 1] : null;

async function main() {
  console.log('=== Trial Balance Variance Diagnostic ===');
  console.log(`Date range: ${startDate} to ${endDate}`);
  console.log('');

  // 1. Get tenant(s)
  const tenants = specificTenant
    ? await sql`SELECT id, name FROM tenants WHERE id = ${specificTenant}`
    : await sql`SELECT id, name FROM tenants WHERE status = 'active' ORDER BY name`;

  for (const tenant of tenants) {
    console.log(`\n══ Tenant: ${tenant.name} (${tenant.id}) ══`);
    await diagnoseTenant(tenant.id);
  }

  await sql.end();
  console.log('\nDone.');
}

async function diagnoseTenant(tenantId) {
  // ── Check 1: Unbalanced journal entries ──
  console.log('\n── Check 1: Unbalanced Journal Entries ──');
  const unbalanced = await sql`
    SELECT
      je.id,
      je.journal_number,
      je.source_module,
      je.source_reference_id,
      je.business_date,
      je.status,
      je.exchange_rate,
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_debits,
      COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_credits,
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
        - COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) AS variance,
      COUNT(jl.id) AS line_count
    FROM gl_journal_entries je
    LEFT JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id AND jl.tenant_id = je.tenant_id
    WHERE je.tenant_id = ${tenantId}
      AND je.status = 'posted'
      AND je.business_date >= ${startDate}
      AND je.business_date <= ${endDate}
    GROUP BY je.id, je.journal_number, je.source_module, je.source_reference_id,
             je.business_date, je.status, je.exchange_rate
    HAVING ABS(
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
      - COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
    ) >= 0.01
    ORDER BY ABS(
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
      - COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
    ) DESC
    LIMIT 50
  `;

  if (unbalanced.length === 0) {
    console.log('  ✓ No unbalanced entries found in date range');
  } else {
    let totalVariance = 0;
    console.log(`  ✗ Found ${unbalanced.length} unbalanced entries:`);
    console.log('');
    for (const row of unbalanced) {
      const variance = Number(row.variance);
      totalVariance += variance;
      console.log(`  JE #${row.journal_number} | ${row.business_date} | source=${row.source_module} | ref=${row.source_reference_id}`);
      console.log(`    status=${row.status} | lines=${row.line_count} | exchange_rate=${row.exchange_rate}`);
      console.log(`    debits=$${Number(row.total_debits).toFixed(2)} | credits=$${Number(row.total_credits).toFixed(2)} | variance=$${variance.toFixed(2)}`);
      console.log('');
    }
    console.log(`  TOTAL VARIANCE from unbalanced entries: $${totalVariance.toFixed(2)}`);
  }

  // ── Check 2: Posted entries with zero lines ──
  console.log('\n── Check 2: Posted Entries with Zero Lines ──');
  const zeroLines = await sql`
    SELECT je.id, je.journal_number, je.source_module, je.source_reference_id, je.business_date
    FROM gl_journal_entries je
    LEFT JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id AND jl.tenant_id = je.tenant_id
    WHERE je.tenant_id = ${tenantId}
      AND je.status = 'posted'
      AND je.business_date >= ${startDate}
      AND je.business_date <= ${endDate}
    GROUP BY je.id, je.journal_number, je.source_module, je.source_reference_id, je.business_date
    HAVING COUNT(jl.id) = 0
    ORDER BY je.business_date
  `;

  if (zeroLines.length === 0) {
    console.log('  ✓ No posted entries with zero lines');
  } else {
    console.log(`  ✗ Found ${zeroLines.length} posted entries with ZERO lines (orphaned headers):`);
    for (const row of zeroLines) {
      console.log(`  JE #${row.journal_number} | ${row.business_date} | source=${row.source_module} | ref=${row.source_reference_id}`);
    }
  }

  // ── Check 3: Orphaned journal lines (no matching entry) ──
  console.log('\n── Check 3: Orphaned Journal Lines (no matching entry) ──');
  const orphanedLines = await sql`
    SELECT COUNT(*) AS cnt,
           COALESCE(SUM(jl.debit_amount), 0) AS orphan_debits,
           COALESCE(SUM(jl.credit_amount), 0) AS orphan_credits
    FROM gl_journal_lines jl
    LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
    WHERE jl.tenant_id = ${tenantId}
      AND je.id IS NULL
  `;
  const orphanCount = Number(orphanedLines[0].cnt);
  if (orphanCount === 0) {
    console.log('  ✓ No orphaned journal lines');
  } else {
    console.log(`  ✗ Found ${orphanCount} orphaned journal lines`);
    console.log(`    orphan debits=$${Number(orphanedLines[0].orphan_debits).toFixed(2)} | orphan credits=$${Number(orphanedLines[0].orphan_credits).toFixed(2)}`);
  }

  // ── Check 4: Lines referencing accounts NOT in gl_accounts ──
  console.log('\n── Check 4: Lines Referencing Missing Accounts ──');
  const missingAccounts = await sql`
    SELECT jl.account_id, COUNT(*) AS cnt,
           COALESCE(SUM(jl.debit_amount), 0) AS debits,
           COALESCE(SUM(jl.credit_amount), 0) AS credits
    FROM gl_journal_lines jl
    JOIN gl_journal_entries je ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
    LEFT JOIN gl_accounts a ON a.id = jl.account_id AND a.tenant_id = jl.tenant_id
    WHERE jl.tenant_id = ${tenantId}
      AND je.status = 'posted'
      AND je.business_date >= ${startDate}
      AND je.business_date <= ${endDate}
      AND a.id IS NULL
    GROUP BY jl.account_id
  `;

  if (missingAccounts.length === 0) {
    console.log('  ✓ All lines reference valid accounts');
  } else {
    console.log(`  ✗ Found ${missingAccounts.length} missing account(s):`);
    for (const row of missingAccounts) {
      console.log(`  account_id=${row.account_id} | ${row.cnt} lines | debits=$${Number(row.debits).toFixed(2)} | credits=$${Number(row.credits).toFixed(2)}`);
    }
  }

  // ── Check 5: Trial balance totals (same as the report query) ──
  console.log('\n── Check 5: Trial Balance Totals (matching report query) ──');
  const tbTotals = await sql`
    SELECT
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_debits,
      COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_credits
    FROM gl_accounts a
    LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND je.tenant_id = ${tenantId}
      AND je.business_date >= ${startDate}
      AND je.business_date <= ${endDate}
    WHERE a.tenant_id = ${tenantId}
      AND (jl.id IS NULL OR je.id IS NOT NULL)
  `;

  const debits = Number(tbTotals[0].total_debits);
  const credits = Number(tbTotals[0].total_credits);
  const variance = Math.round((debits - credits) * 100) / 100;
  console.log(`  Total Debits:  $${debits.toFixed(2)}`);
  console.log(`  Total Credits: $${credits.toFixed(2)}`);
  console.log(`  Variance:      $${variance.toFixed(2)}`);

  // ── Check 6: Compare entry-level vs account-level totals ──
  // If these differ, the trial balance query has a JOIN issue
  console.log('\n── Check 6: Entry-Level Totals (should match Check 5) ──');
  const entryTotals = await sql`
    SELECT
      COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_debits,
      COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) AS total_credits
    FROM gl_journal_entries je
    JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id AND jl.tenant_id = je.tenant_id
    WHERE je.tenant_id = ${tenantId}
      AND je.status = 'posted'
      AND je.business_date >= ${startDate}
      AND je.business_date <= ${endDate}
  `;

  const entDebits = Number(entryTotals[0].total_debits);
  const entCredits = Number(entryTotals[0].total_credits);
  console.log(`  Total Debits:  $${entDebits.toFixed(2)}`);
  console.log(`  Total Credits: $${entCredits.toFixed(2)}`);
  console.log(`  Variance:      $${(entDebits - entCredits).toFixed(2)}`);

  if (Math.abs(debits - entDebits) >= 0.01 || Math.abs(credits - entCredits) >= 0.01) {
    console.log(`  ⚠ MISMATCH between account-level and entry-level totals!`);
    console.log(`    This means the trial balance LEFT JOIN is picking up extra/missing lines.`);
    console.log(`    Debit diff: $${(debits - entDebits).toFixed(2)} | Credit diff: $${(credits - entCredits).toFixed(2)}`);
  } else {
    console.log('  ✓ Account-level and entry-level totals match');
  }

  // ── Check 7: Cross-tenant journal lines ──
  console.log('\n── Check 7: Cross-Tenant Journal Lines ──');
  const crossTenant = await sql`
    SELECT COUNT(*) AS cnt,
           COALESCE(SUM(jl.debit_amount), 0) AS debits,
           COALESCE(SUM(jl.credit_amount), 0) AS credits
    FROM gl_journal_lines jl
    JOIN gl_accounts a ON a.id = jl.account_id
    WHERE a.tenant_id = ${tenantId}
      AND jl.tenant_id != ${tenantId}
  `;
  const ctCount = Number(crossTenant[0].cnt);
  if (ctCount === 0) {
    console.log('  ✓ No cross-tenant journal lines');
  } else {
    console.log(`  ✗ Found ${ctCount} journal lines from other tenants referencing this tenant's accounts`);
    console.log(`    debits=$${Number(crossTenant[0].debits).toFixed(2)} | credits=$${Number(crossTenant[0].credits).toFixed(2)}`);
  }

  // ── Check 8: Does gl_journal_entry_lines table exist? ──
  console.log('\n── Check 8: Stale Table Check (gl_journal_entry_lines) ──');
  const staleTable = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'gl_journal_entry_lines'
    ) AS exists_flag
  `;
  if (staleTable[0].exists_flag) {
    const staleCount = await sql`
      SELECT COUNT(*) AS cnt,
             COALESCE(SUM(debit_amount), 0) AS debits,
             COALESCE(SUM(credit_amount), 0) AS credits
      FROM gl_journal_entry_lines
      WHERE tenant_id = ${tenantId}
    `;
    console.log(`  ⚠ Table gl_journal_entry_lines EXISTS with ${staleCount[0].cnt} rows for this tenant`);
    console.log(`    debits=$${Number(staleCount[0].debits).toFixed(2)} | credits=$${Number(staleCount[0].credits).toFixed(2)}`);
    console.log(`    The backfill script (backfill-gl-direct.cjs) inserts lines into this wrong table name.`);
    console.log(`    These lines are INVISIBLE to the trial balance query which reads gl_journal_lines.`);
  } else {
    console.log('  ✓ No stale gl_journal_entry_lines table');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
