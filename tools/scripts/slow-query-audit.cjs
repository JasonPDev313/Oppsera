#!/usr/bin/env node
/**
 * slow-query-audit.cjs — Automated Slow Query Audit & Index Recommender
 *
 * Connects to Postgres (local or remote via --remote flag), queries
 * pg_stat_statements for slow queries (>100ms p95), proposes index
 * candidates, checks for redundancy, and generates a formatted report.
 *
 * Usage:
 *   node tools/scripts/slow-query-audit.cjs            # local DB
 *   node tools/scripts/slow-query-audit.cjs --remote    # production DB
 *   node tools/scripts/slow-query-audit.cjs --reset     # reset pg_stat_statements after report
 *   node tools/scripts/slow-query-audit.cjs --migration # generate draft migration file
 *
 * Requires: postgres (postgres.js), dotenv
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. ENV + Connection
// ---------------------------------------------------------------------------

const isRemote = process.argv.includes('--remote');
const doReset = process.argv.includes('--reset');
const doMigration = process.argv.includes('--migration');

const envFile = isRemote ? '.env.remote' : '.env.local';
const envPath = path.resolve(__dirname, '../../', envFile);

require('dotenv').config({ path: envPath });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(`ERROR: DATABASE_URL not found. Checked ${envFile} and .env`);
  process.exit(1);
}

const postgres = require('postgres');
const sql = postgres(DATABASE_URL, {
  max: 1,
  prepare: false,         // Required for Supavisor transaction mode
  idle_timeout: 20,
  connect_timeout: 10,
});

// ---------------------------------------------------------------------------
// 2. Multi-Tenant Table Registry (tables with tenant_id that MUST have
//    tenant_id as the leading index column)
// ---------------------------------------------------------------------------

const MT_TABLES = new Set([
  'users', 'memberships', 'role_assignments', 'role_permissions',
  'entitlements', 'locations', 'terminal_locations', 'terminals',
  'audit_log', 'event_outbox', 'processed_events', 'background_jobs',
  'tenant_settings',
  // Catalog
  'catalog_items', 'catalog_categories', 'catalog_modifier_groups',
  'catalog_modifiers', 'catalog_item_modifier_groups', 'catalog_item_change_logs',
  'catalog_item_tax_groups',
  // Orders / Payments
  'orders', 'order_lines', 'order_line_taxes', 'order_discounts',
  'order_service_charges', 'tenders', 'tender_reversals',
  'payment_journal_entries',
  // Inventory
  'inventory_items', 'inventory_movements', 'vendors', 'item_vendors',
  'item_identifiers', 'receiving_receipts', 'receiving_receipt_lines',
  'purchase_orders', 'purchase_order_lines',
  // Customers
  'customers', 'customer_relationships', 'customer_identifiers',
  'customer_activity_log', 'membership_plans', 'customer_memberships',
  'billing_accounts', 'ar_transactions', 'ar_allocations',
  'customer_tags', 'tags', 'smart_tag_rules',
  // Reporting
  'rm_daily_sales', 'rm_item_sales', 'rm_inventory_on_hand',
  'rm_customer_activity', 'report_definitions', 'dashboard_definitions',
  // GL / Accounting
  'gl_accounts', 'gl_classifications', 'gl_journal_entries',
  'gl_journal_lines', 'gl_unmapped_events', 'accounting_close_periods',
  'sub_department_gl_defaults', 'payment_type_gl_defaults',
  'tax_group_gl_defaults', 'bank_accounts', 'bank_reconciliations',
  'ap_bills', 'ap_bill_lines', 'ap_payments', 'ap_payment_allocations',
  'ar_invoices', 'ar_invoice_lines', 'ar_receipts',
  // F&B
  'fnb_tables', 'fnb_tabs', 'fnb_tab_items', 'fnb_kitchen_tickets',
  'fnb_kitchen_ticket_items', 'fnb_kitchen_stations',
  'fnb_close_batch_summaries', 'fnb_reservations', 'fnb_waitlist_entries',
  // PMS
  'pms_reservations', 'pms_rooms', 'pms_room_types', 'pms_rate_plans',
  'pms_folios', 'pms_folio_entries', 'pms_guests',
  // Drawer / Close
  'drawer_sessions', 'drawer_session_events', 'retail_close_batches',
  'payment_settlements', 'tip_payouts', 'deposit_slips',
  // Misc
  'guest_pay_sessions', 'event_dead_letters',
]);

// Low-cardinality columns that should NOT get standalone B-tree indexes.
// These benefit from partial indexes or composite indexes instead.
const LOW_CARDINALITY_COLUMNS = new Set([
  'status', 'is_active', 'type', 'item_type', 'access_mode',
  'location_type', 'posting_mode', 'cogs_posting_mode',
  'movement_type', 'tender_type', 'payment_method',
  'discount_classification', 'normal_balance', 'account_type',
]);

// ---------------------------------------------------------------------------
// 3. Slow Query Extraction (Deliverable B)
// ---------------------------------------------------------------------------

async function getSlowQueries(thresholdMs = 100, limit = 30) {
  // p95 approximation: mean + 2 * stddev  (Gaussian)
  const rows = await sql`
    SELECT
      queryid,
      LEFT(query, 500)                                      AS query_text,
      calls,
      ROUND(total_exec_time::numeric, 2)                    AS total_ms,
      ROUND(mean_exec_time::numeric, 2)                     AS mean_ms,
      ROUND(stddev_exec_time::numeric, 2)                   AS stddev_ms,
      ROUND((mean_exec_time + 2 * stddev_exec_time)::numeric, 2) AS p95_approx_ms,
      ROUND((shared_blks_hit + shared_blks_read)::numeric, 0)    AS total_blocks,
      CASE WHEN (shared_blks_hit + shared_blks_read) > 0
           THEN ROUND(100.0 * shared_blks_hit /
                       (shared_blks_hit + shared_blks_read), 1)
           ELSE 100
      END                                                   AS cache_hit_pct,
      rows                                                  AS total_rows
    FROM pg_stat_statements
    WHERE calls > 5
      AND (mean_exec_time + 2 * stddev_exec_time) > ${thresholdMs}
      AND query NOT LIKE '%pg_stat%'
      AND query NOT LIKE '%pg_catalog%'
    ORDER BY (mean_exec_time + 2 * stddev_exec_time) DESC
    LIMIT ${limit}
  `;
  return Array.from(rows);
}

// ---------------------------------------------------------------------------
// 4. Diagnostics: Table I/O, Unused Indexes, Missing FK Indexes
// ---------------------------------------------------------------------------

async function getTableIO(limit = 20) {
  const rows = await sql`
    SELECT
      schemaname, relname,
      seq_scan, seq_tup_read,
      idx_scan, idx_tup_fetch,
      CASE WHEN (seq_scan + idx_scan) > 0
           THEN ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 1)
           ELSE 0
      END AS seq_scan_pct
    FROM pg_stat_user_tables
    WHERE (seq_scan + idx_scan) > 100
    ORDER BY seq_scan DESC
    LIMIT ${limit}
  `;
  return Array.from(rows);
}

async function getUnusedIndexes() {
  const rows = await sql`
    SELECT
      s.schemaname, s.relname AS table_name,
      s.indexrelname AS index_name,
      s.idx_scan,
      pg_relation_size(s.indexrelid) AS index_bytes,
      pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.idx_scan = 0
      AND NOT i.indisunique
      AND NOT i.indisprimary
      AND pg_relation_size(s.indexrelid) > 65536
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 20
  `;
  return Array.from(rows);
}

async function getMissingFKIndexes() {
  const rows = await sql`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS referenced_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_indexes pi
        WHERE pi.tablename = tc.table_name
          AND pi.schemaname = 'public'
          AND pi.indexdef ILIKE '%' || kcu.column_name || '%'
      )
    ORDER BY tc.table_name, kcu.column_name
  `;
  return Array.from(rows);
}

async function getExistingIndexes() {
  const rows = await sql`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;
  return Array.from(rows);
}

// ---------------------------------------------------------------------------
// 5. Index Candidate Generator (Deliverable C + D)
// ---------------------------------------------------------------------------

/**
 * Parse normalized query text to propose index candidates.
 * This is heuristic — pg_stat_statements normalizes constants to $N.
 */
function proposeIndexCandidates(slowQueries, existingIndexes) {
  const candidates = [];
  const existingDefs = existingIndexes.map(i => i.indexdef.toLowerCase());

  for (const q of slowQueries) {
    const text = (q.query_text || '').toLowerCase();
    const tableMatch = text.match(/from\s+"?(\w+)"?/);
    if (!tableMatch) continue;
    const table = tableMatch[1];

    // Extract WHERE columns
    const whereColumns = [];
    const whereRegex = /(\w+)\s*(?:=|<|>|<=|>=|<>|!=|is\s+(?:not\s+)?null|in\s*\(|like|ilike)\s*/gi;
    let m;
    while ((m = whereRegex.exec(text)) !== null) {
      const col = m[1];
      if (!['select', 'from', 'where', 'and', 'or', 'not', 'join', 'on', 'set', 'into', 'values', 'insert', 'update', 'delete', 'limit', 'offset', 'order', 'group', 'having', 'case', 'when', 'then', 'else', 'end', 'as', 'left', 'right', 'inner', 'outer', 'cross', 'null', 'true', 'false'].includes(col)) {
        whereColumns.push(col);
      }
    }

    // Extract ORDER BY columns
    const orderColumns = [];
    const orderMatch = text.match(/order\s+by\s+(.+?)(?:\s+limit|\s*$)/i);
    if (orderMatch) {
      const parts = orderMatch[1].split(',').map(p => p.trim().split(/\s+/)[0].replace(/"/g, ''));
      for (const p of parts) {
        if (p && !['asc', 'desc', 'nulls', 'first', 'last'].includes(p)) {
          orderColumns.push(p);
        }
      }
    }

    // Detect ILIKE (GIN candidate)
    if (text.includes('ilike')) {
      const ilikeMatch = text.match(/(\w+)\s+ilike/i);
      if (ilikeMatch) {
        candidates.push({
          table,
          columns: [ilikeMatch[1]],
          type: 'gin_trgm',
          reason: `ILIKE on ${ilikeMatch[1]} (p95 ${q.p95_approx_ms}ms, ${q.calls} calls)`,
          queryid: q.queryid,
          p95: q.p95_approx_ms,
          calls: q.calls,
        });
      }
    }

    // Build composite index candidate
    if (whereColumns.length > 0) {
      let cols = [...new Set(whereColumns)];

      // Enforce tenant_id as leading column for multi-tenant tables
      if (MT_TABLES.has(table) && !cols.includes('tenant_id')) {
        cols.unshift('tenant_id');
      } else if (MT_TABLES.has(table) && cols.includes('tenant_id') && cols[0] !== 'tenant_id') {
        cols = ['tenant_id', ...cols.filter(c => c !== 'tenant_id')];
      }

      // Filter low-cardinality columns that shouldn't be standalone
      const hasOnlyLowCard = cols.every(c => LOW_CARDINALITY_COLUMNS.has(c) || c === 'tenant_id');
      let partialWhere = null;

      // If status/type is in WHERE with a specific value, suggest a partial index
      const statusMatch = text.match(/(status|type|is_active)\s*=\s*\$\d+/i);
      if (statusMatch) {
        partialWhere = `${statusMatch[1]} = '<value>'`;
      }

      // Append ORDER BY columns at end of composite index
      for (const oc of orderColumns) {
        if (!cols.includes(oc)) cols.push(oc);
      }

      candidates.push({
        table,
        columns: cols,
        type: hasOnlyLowCard ? 'partial' : 'btree',
        partialWhere,
        reason: `WHERE on [${whereColumns.join(', ')}], ORDER BY [${orderColumns.join(', ') || 'none'}] (p95 ${q.p95_approx_ms}ms, ${q.calls} calls)`,
        queryid: q.queryid,
        p95: q.p95_approx_ms,
        calls: q.calls,
      });
    }
  }

  // Deduplicate: if same table+columns already exists, skip
  const deduped = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = `${c.table}:${c.columns.join(',')}:${c.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Check redundancy against existing indexes
    const colList = c.columns.join(', ');
    const isRedundant = existingDefs.some(def => {
      return def.includes(c.table) && c.columns.every(col => def.includes(col));
    });
    if (isRedundant) {
      c.redundant = true;
    }

    deduped.push(c);
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// 6. Report Formatter
// ---------------------------------------------------------------------------

function formatReport(slowQueries, tableIO, unusedIndexes, missingFKs, candidates) {
  const lines = [];
  const now = new Date().toISOString();
  const target = isRemote ? 'REMOTE (production)' : 'LOCAL';

  lines.push('='.repeat(80));
  lines.push(`  SLOW QUERY AUDIT REPORT — ${target}`);
  lines.push(`  Generated: ${now}`);
  lines.push('='.repeat(80));

  // Section A: Slow Queries
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  A. TOP SLOW QUERIES (p95 > 100ms)');
  lines.push('-'.repeat(80));
  if (slowQueries.length === 0) {
    lines.push('  No queries above threshold. pg_stat_statements may need more run time.');
  }
  for (const [i, q] of slowQueries.entries()) {
    lines.push('');
    lines.push(`  #${i + 1}  queryid: ${q.queryid}`);
    lines.push(`  p95 ≈ ${q.p95_approx_ms}ms | mean ${q.mean_ms}ms | stddev ${q.stddev_ms}ms`);
    lines.push(`  calls: ${q.calls} | total: ${q.total_ms}ms | rows: ${q.total_rows}`);
    lines.push(`  cache hit: ${q.cache_hit_pct}% | blocks: ${q.total_blocks}`);
    lines.push(`  query: ${q.query_text}`);
  }

  // Section B: Table I/O
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  B. TABLE I/O — HIGH SEQUENTIAL SCAN TABLES');
  lines.push('-'.repeat(80));
  for (const t of tableIO) {
    lines.push(`  ${t.relname.padEnd(40)} seq_scan: ${String(t.seq_scan).padStart(8)} (${t.seq_scan_pct}%)  idx_scan: ${String(t.idx_scan).padStart(8)}`);
  }

  // Section C: Unused Indexes
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  C. UNUSED INDEXES (0 scans, >64KB)');
  lines.push('-'.repeat(80));
  if (unusedIndexes.length === 0) {
    lines.push('  No unused indexes found.');
  }
  for (const u of unusedIndexes) {
    lines.push(`  ${u.index_name.padEnd(50)} ${u.index_size.padStart(10)}  on ${u.table_name}`);
  }

  // Section D: Missing FK Indexes
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  D. FOREIGN KEYS WITHOUT INDEXES');
  lines.push('-'.repeat(80));
  if (missingFKs.length === 0) {
    lines.push('  All foreign keys have covering indexes.');
  }
  for (const fk of missingFKs) {
    lines.push(`  ${fk.table_name}.${fk.column_name} -> ${fk.referenced_table}`);
  }

  // Section E: Index Candidates
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  E. INDEX CANDIDATES');
  lines.push('-'.repeat(80));
  const actionable = candidates.filter(c => !c.redundant);
  const redundant = candidates.filter(c => c.redundant);

  if (actionable.length === 0) {
    lines.push('  No new index candidates. Existing indexes cover observed queries.');
  }
  for (const [i, c] of actionable.entries()) {
    lines.push('');
    lines.push(`  Candidate #${i + 1}  [${c.type.toUpperCase()}]`);
    lines.push(`  Table: ${c.table}`);
    lines.push(`  Columns: (${c.columns.join(', ')})`);
    if (c.partialWhere) lines.push(`  Partial WHERE: ${c.partialWhere}`);
    lines.push(`  Reason: ${c.reason}`);
  }

  if (redundant.length > 0) {
    lines.push('');
    lines.push('  -- Skipped (redundant with existing indexes):');
    for (const c of redundant) {
      lines.push(`     ${c.table}(${c.columns.join(', ')}) — already covered`);
    }
  }

  // Safety Checklist
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('  F. SAFETY CHECKLIST — BEFORE APPLYING INDEXES');
  lines.push('-'.repeat(80));
  lines.push('  [ ] Use CREATE INDEX CONCURRENTLY (avoids table locks)');
  lines.push('  [ ] CONCURRENTLY cannot run inside a transaction — use raw SQL, not Drizzle migration wrapper');
  lines.push('  [ ] Test on staging/local first with EXPLAIN ANALYZE');
  lines.push('  [ ] Check pg_stat_user_indexes after 24h to verify the new index is actually used');
  lines.push('  [ ] For tables >10M rows, schedule during low-traffic window');
  lines.push('  [ ] Monitor pg_stat_activity during index creation for lock contention');
  lines.push('  [ ] Rollback: DROP INDEX CONCURRENTLY IF EXISTS <name>;');
  lines.push('  [ ] Never add standalone B-tree on low-cardinality columns (status, type, is_active)');
  lines.push('  [ ] Multi-tenant tables MUST have tenant_id as the leading index column');
  lines.push('  [ ] Partial indexes for filtered hot paths: WHERE status = \'active\' AND tenant_id = $1');
  lines.push('  [ ] GIN indexes for ILIKE queries — ensure pg_trgm extension is enabled');
  lines.push('  [ ] INCLUDE columns for covering indexes (avoids heap fetch)');

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('  END OF REPORT');
  lines.push('='.repeat(80));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. Migration File Generator (Deliverable D)
// ---------------------------------------------------------------------------

function generateMigrationSQL(candidates) {
  const actionable = candidates.filter(c => !c.redundant);
  if (actionable.length === 0) return null;

  const lines = [];
  lines.push('-- Auto-generated index candidates from slow-query-audit');
  lines.push('-- Review each index carefully before applying');
  lines.push('-- IMPORTANT: CONCURRENTLY indexes cannot run inside a transaction.');
  lines.push('--   For Drizzle migrations (which wrap in a transaction), remove CONCURRENTLY');
  lines.push('--   and accept a brief lock, OR run these as raw SQL outside Drizzle.');
  lines.push('');

  for (const c of actionable) {
    const idxName = `idx_${c.table}_${c.columns.join('_')}`.substring(0, 63);
    if (c.type === 'gin_trgm') {
      lines.push(`-- Reason: ${c.reason}`);
      lines.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName}`);
      lines.push(`  ON ${c.table} USING gin (${c.columns[0]} gin_trgm_ops);`);
    } else if (c.type === 'partial' && c.partialWhere) {
      lines.push(`-- Reason: ${c.reason}`);
      lines.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName}`);
      lines.push(`  ON ${c.table} (${c.columns.join(', ')})`);
      lines.push(`  WHERE ${c.partialWhere};`);
    } else {
      lines.push(`-- Reason: ${c.reason}`);
      lines.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName}`);
      lines.push(`  ON ${c.table} (${c.columns.join(', ')});`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nSlow Query Audit — connecting to ${isRemote ? 'REMOTE' : 'LOCAL'} DB...\n`);

  // Check pg_stat_statements
  try {
    await sql`SELECT 1 FROM pg_stat_statements LIMIT 1`;
    console.log('  pg_stat_statements: ENABLED');
  } catch (err) {
    console.log('  pg_stat_statements: NOT AVAILABLE');
    console.log('  Attempting to enable...');
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`;
      console.log('  pg_stat_statements: ENABLED (just created)');
      console.log('  NOTE: Stats will be empty — run workload first, then re-run this script.');
    } catch (err2) {
      console.error('  FAILED to enable pg_stat_statements:', err2.message);
      console.error('  For Supabase: go to Dashboard > Database > Extensions > enable pg_stat_statements');
      await sql.end();
      process.exit(1);
    }
  }

  // Check pg_trgm (needed for GIN trigram indexes)
  try {
    await sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`;
    console.log('  pg_trgm: ENABLED');
  } catch {
    console.log('  pg_trgm: checking...');
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
      console.log('  pg_trgm: ENABLED');
    } catch {
      console.log('  pg_trgm: NOT AVAILABLE (GIN trigram indexes will not work)');
    }
  }

  console.log('\n  Gathering data...\n');

  // Run all diagnostics in parallel
  const [slowQueries, tableIO, unusedIndexes, missingFKs, existingIndexes] = await Promise.all([
    getSlowQueries(100, 30),
    getTableIO(20),
    getUnusedIndexes(),
    getMissingFKIndexes(),
    getExistingIndexes(),
  ]);

  console.log(`  Slow queries (p95 > 100ms): ${slowQueries.length}`);
  console.log(`  Tables with high seq_scan:  ${tableIO.length}`);
  console.log(`  Unused indexes (>64KB):     ${unusedIndexes.length}`);
  console.log(`  Missing FK indexes:         ${missingFKs.length}`);
  console.log(`  Existing indexes:           ${existingIndexes.length}`);

  // Generate index candidates
  const candidates = proposeIndexCandidates(slowQueries, existingIndexes);
  const actionable = candidates.filter(c => !c.redundant);
  console.log(`  Index candidates:           ${actionable.length} new, ${candidates.length - actionable.length} redundant`);

  // Format and save report
  const report = formatReport(slowQueries, tableIO, unusedIndexes, missingFKs, candidates);
  const reportsDir = path.resolve(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(reportsDir, `slow-query-audit-${dateStr}.txt`);
  fs.writeFileSync(reportFile, report, 'utf8');
  console.log(`\n  Report saved: ${reportFile}`);

  // Generate migration file if requested
  if (doMigration && actionable.length > 0) {
    const migrationSQL = generateMigrationSQL(candidates);
    if (migrationSQL) {
      const migDir = path.resolve(__dirname, '../../packages/db/migrations');
      const journalPath = path.join(migDir, 'meta/_journal.json');
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      const nextIdx = journal.entries.length;
      const paddedIdx = String(nextIdx).padStart(4, '0');
      const migFile = path.join(migDir, `${paddedIdx}_slow_query_indexes.sql`);

      // Save the SQL as a draft file (do NOT update _journal.json automatically)
      fs.writeFileSync(migFile, migrationSQL, 'utf8');
      console.log(`  Draft migration saved: ${migFile}`);
      console.log(`  WARNING: This is a DRAFT. Review before committing.`);
      console.log(`  WARNING: CONCURRENTLY indexes cannot run inside Drizzle migration transactions.`);
      console.log(`           Remove CONCURRENTLY or run as raw SQL.`);
      console.log(`  WARNING: You must manually add the journal entry to _journal.json.`);
    }
  }

  // Reset pg_stat_statements if requested
  if (doReset) {
    try {
      await sql`SELECT pg_stat_statements_reset()`;
      console.log('\n  pg_stat_statements: RESET (stats cleared)');
    } catch (err) {
      console.error('\n  Failed to reset pg_stat_statements:', err.message);
    }
  }

  // Print summary to stdout
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));

  if (actionable.length > 0) {
    console.log(`\n  ${actionable.length} index candidate(s) found:\n`);
    for (const c of actionable) {
      console.log(`    ${c.table}(${c.columns.join(', ')}) [${c.type}] — p95 ${c.p95}ms, ${c.calls} calls`);
    }
    console.log(`\n  See full report: ${reportFile}`);
  } else {
    console.log('\n  No new index candidates. Database is well-indexed for current workload.');
  }

  if (unusedIndexes.length > 0) {
    console.log(`\n  ${unusedIndexes.length} unused index(es) found — consider dropping to save storage.`);
  }

  if (missingFKs.length > 0) {
    console.log(`\n  ${missingFKs.length} foreign key(s) without indexes — may cause slow JOINs/cascading deletes.`);
  }

  console.log('');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\nFATAL:', err);
  try { await sql.end(); } catch {}
  process.exit(1);
});
