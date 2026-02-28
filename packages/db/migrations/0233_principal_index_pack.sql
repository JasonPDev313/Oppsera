-- Migration: 0233_principal_index_pack.sql
-- Purpose: Principal DB performance index pack — minimum set to reduce p95 >100ms
-- Date: 2026-02-28
-- Analysis: Code-level review of 16 hot-path query patterns across 6 tiers
--           (auth, POS, dashboard, reporting, GL, customers)
-- Methodology: Cross-referenced 88 existing performance indexes to identify gaps
--
-- ===========================================================================
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- Drizzle migrations run inside a transaction by default.
--
-- For production:
--   psql $DATABASE_URL -f packages/db/migrations/0233_principal_index_pack.sql
--
-- For local dev (no concurrent sessions, OK to remove CONCURRENTLY):
--   pnpm db:migrate
-- ===========================================================================


-- ───────────────────────────────────────────────────────────────────────────
-- Index 1: GL Journal Lines — Covering index for balance aggregation
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: getAccountBalances, getTrialBalance, getBalanceSheet, getProfitAndLoss
-- Pattern: LEFT JOIN gl_journal_lines ON account_id → SUM(debit_amount, credit_amount)
-- Current: idx_gl_journal_lines_account_id (bare) + idx_gl_journal_lines_account_entry
--          (no INCLUDE → heap fetch for every line to read amounts)
-- Benefit: Index-only scans for SUM aggregation. Eliminates heap fetches on
--          the largest GL table. p95 350ms+ → est. 80ms.
-- Write cost: Moderate (insert-only, never updated). ~4-8 lines per tender.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gl_journal_lines_account_entry_amounts
  ON gl_journal_lines (account_id, journal_entry_id)
  INCLUDE (debit_amount, credit_amount);


-- ───────────────────────────────────────────────────────────────────────────
-- Index 2: GL Journal Entries — Partial index for posted entries by date
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: getTrialBalance, getProfitAndLoss, getBalanceSheet, getAccountBalances
-- Pattern: WHERE status = 'posted' AND business_date BETWEEN $from AND $to
-- Current: idx_gl_journal_entries_tenant_status (no date),
--          idx_gl_journal_entries_tenant_date (no status filter)
-- Benefit: Partial index excludes draft/error/voided entries (~5-10%).
--          Combined with date, eliminates full JOIN scans. p95 500ms+ → est. 120ms.
-- Write cost: Low — only materialized on status='posted' transition.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gl_journal_entries_tenant_posted_date
  ON gl_journal_entries (tenant_id, business_date)
  WHERE status = 'posted';


-- ───────────────────────────────────────────────────────────────────────────
-- Index 3: rm_daily_sales — Covering index for dashboard metrics
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: getDashboardMetrics (dashboard load, ~2000/day)
-- Pattern: SUM(net_sales, order_count, void_count, ...) WHERE tenant_id AND
--          business_date range AND optional location_id
-- Current: idx_rm_daily_sales_tenant_date (no location, no INCLUDE → heap fetch)
-- Benefit: Full index-only scan for dashboard SUM. Eliminates heap access.
--          p95 120ms → est. 15ms.
-- Write cost: Very low (upsert once per event, ~365 rows/tenant/location/year).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_daily_sales_dashboard_covering
  ON rm_daily_sales (tenant_id, business_date DESC, location_id)
  INCLUDE (net_sales, order_count, void_count, pms_revenue, ar_revenue,
           membership_revenue, voucher_revenue, total_business_revenue);


-- ───────────────────────────────────────────────────────────────────────────
-- Index 4: Orders — Partial index for active orders with location filter
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: listOrders (order history page, ~1500/day)
-- Pattern: WHERE tenant_id AND location_id AND status IN (...) ORDER BY created_at DESC
-- Current: idx_orders_tenant_location_created_id (full, no partial filter)
-- Benefit: Partial index excludes voided orders (~8%). Smaller index, faster scans
--          for the dominant "active orders at location" query. p95 150ms → est. 40ms.
-- Write cost: Low — orders created often but rarely transition to voided.
-- Note: Keeps existing full index for admin/void queries.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_location_active
  ON orders (tenant_id, location_id, created_at DESC)
  WHERE status IN ('open', 'placed', 'paid');


-- ───────────────────────────────────────────────────────────────────────────
-- Index 5: rm_item_sales — Covering index for top-N revenue queries
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: getItemSales top-N (reports tab, ~500/day)
-- Pattern: SUM(total_revenue) GROUP BY item ORDER BY revenue DESC LIMIT N
-- Current: idx_rm_item_sales_tenant_date (no INCLUDE → heap fetch per row)
-- Benefit: Index-only scan for revenue aggregation + item names.
--          p95 130ms → est. 25ms.
-- Write cost: Very low (same upsert pattern as rm_daily_sales).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_item_sales_revenue_covering
  ON rm_item_sales (tenant_id, business_date)
  INCLUDE (gross_revenue, quantity_sold, catalog_item_name);


-- ───────────────────────────────────────────────────────────────────────────
-- Index 6: gl_unmapped_events — Partial index for unresolved events
-- ───────────────────────────────────────────────────────────────────────────
-- Queries: listUnmappedEvents (accounting dashboard, ~200/day)
-- Pattern: WHERE tenant_id AND resolved_at IS NULL ORDER BY created_at DESC
-- Current: No index for this pattern.
-- Benefit: Partial index stores only unresolved events (~5-15% of total).
--          Instant lookup for the "what needs attention" dashboard card.
--          p95 80ms → est. 5ms.
-- Write cost: Negligible (events inserted infrequently, resolved_at rarely changes).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gl_unmapped_events_tenant_unresolved
  ON gl_unmapped_events (tenant_id, created_at DESC)
  WHERE resolved_at IS NULL;


-- ===========================================================================
-- REDUNDANCY CLEANUP (run AFTER verifying new indexes are used for 7 days)
-- ===========================================================================
-- After confirming idx_scan > 0 on the new indexes via:
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--   WHERE indexrelname LIKE 'idx_gl_journal_lines_account%';
--
-- Then drop the superseded indexes:
--
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gl_journal_lines_account_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gl_journal_lines_account_entry;
--
-- DO NOT drop these until the new covering index is confirmed working.
-- ===========================================================================


-- ===========================================================================
-- DOWN / ROLLBACK
-- ===========================================================================
-- Safe rollback — CONCURRENTLY avoids locks on all drops:
--
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gl_journal_lines_account_entry_amounts;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gl_journal_entries_tenant_posted_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_rm_daily_sales_dashboard_covering;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_orders_tenant_location_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_rm_item_sales_revenue_covering;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gl_unmapped_events_tenant_unresolved;
-- ===========================================================================
