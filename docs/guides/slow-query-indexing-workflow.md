# Slow Query Indexing Workflow

Staff engineering guide for detecting, reporting, and fixing slow queries in OppsEra.

---

## A. Enable pg_stat_statements on Supabase

pg_stat_statements is the foundation — it tracks execution stats for every normalized query.

### Supabase Dashboard

1. Go to **Database → Extensions**
2. Search for `pg_stat_statements`
3. Click **Enable**

### SQL (if you have superuser access)

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify
SELECT * FROM pg_stat_statements LIMIT 1;

-- Also enable pg_trgm for GIN trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Recommended Postgres Settings

These are already set via `ALTER DATABASE` for OppsEra (see MEMORY.md):

```sql
ALTER DATABASE postgres SET statement_timeout = '30s';
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';
ALTER DATABASE postgres SET lock_timeout = '5s';

-- pg_stat_statements config (set in postgresql.conf or via Supabase dashboard)
-- pg_stat_statements.max = 5000        (default on Supabase)
-- pg_stat_statements.track = 'top'     (only top-level statements)
```

### Reset Stats (after deploying new indexes)

```sql
SELECT pg_stat_statements_reset();
```

---

## B. Slow Query Extraction Report

### Automated Script

```bash
# Local DB
node tools/scripts/slow-query-audit.cjs

# Production
node tools/scripts/slow-query-audit.cjs --remote

# Reset stats after report
node tools/scripts/slow-query-audit.cjs --remote --reset

# Also generate draft migration file
node tools/scripts/slow-query-audit.cjs --remote --migration
```

Report is saved to `reports/slow-query-audit-YYYY-MM-DD.txt`.

### Manual SQL — Top 20 Slow Queries (p95 > 100ms)

```sql
SELECT
  queryid,
  LEFT(query, 300)                                         AS query_text,
  calls,
  ROUND(total_exec_time::numeric, 2)                       AS total_ms,
  ROUND(mean_exec_time::numeric, 2)                        AS mean_ms,
  ROUND(stddev_exec_time::numeric, 2)                      AS stddev_ms,
  ROUND((mean_exec_time + 2 * stddev_exec_time)::numeric, 2) AS p95_approx_ms,
  CASE WHEN (shared_blks_hit + shared_blks_read) > 0
       THEN ROUND(100.0 * shared_blks_hit /
                   (shared_blks_hit + shared_blks_read), 1)
       ELSE 100
  END                                                       AS cache_hit_pct,
  rows                                                      AS total_rows
FROM pg_stat_statements
WHERE calls > 5
  AND (mean_exec_time + 2 * stddev_exec_time) > 100
  AND query NOT LIKE '%pg_stat%'
ORDER BY p95_approx_ms DESC
LIMIT 20;
```

### How p95 is Approximated

pg_stat_statements provides `mean_exec_time` and `stddev_exec_time` but not actual percentiles. We use the Gaussian approximation:

```
p95 ≈ mean + 2 × stddev
```

This is accurate enough for detecting outliers. For exact p95, you'd need `pg_stat_statements` with histogram support (PG 17+) or use `auto_explain` with sampling.

---

## C. Index Recommendation Rubric

### Decision Framework

| Signal | Action | Index Type |
|--------|--------|------------|
| p95 > 100ms AND seq_scan dominant | Add composite B-tree | `(tenant_id, where_cols..., order_cols...)` |
| ILIKE/pattern matching | Add GIN trigram | `USING gin (col gin_trgm_ops)` |
| Status/type filter in WHERE | Add partial index | `WHERE status = 'active'` |
| ORDER BY with LIMIT (pagination) | Add composite with DESC | `(tenant_id, created_at DESC)` |
| JOIN column without index | Add FK index | `(fk_column)` |
| Covering query (all cols in SELECT) | Add INCLUDE | `(key_cols) INCLUDE (payload_cols)` |
| Low-cardinality standalone | DO NOT add B-tree | Use partial or composite instead |

### Multi-Tenant Rule (CRITICAL)

Every index on a tenant-scoped table MUST have `tenant_id` as the **leading column**. Without it, the index is useless — RLS adds `tenant_id = $1` to every query, and Postgres can only use the index if the leading column matches the WHERE clause.

```sql
-- WRONG: tenant_id not leading
CREATE INDEX idx_orders_status ON orders (status);

-- RIGHT: tenant_id first
CREATE INDEX idx_orders_tenant_status ON orders (tenant_id, status);

-- BETTER: partial for common hot path
CREATE INDEX idx_orders_tenant_open ON orders (tenant_id, created_at DESC)
  WHERE status = 'open';
```

### Anti-Patterns

1. **Standalone low-cardinality B-tree** — `CREATE INDEX ON orders (status)` is useless. Status has ~5 values. Use a partial index or composite.
2. **Over-indexing** — Every index slows writes (INSERT/UPDATE/DELETE). Only index columns that appear in WHERE/ORDER BY/JOIN of queries > 100ms.
3. **Redundant indexes** — `(tenant_id, status)` makes `(tenant_id)` redundant. Drop the shorter one.
4. **Missing INCLUDE** — If a query always selects `name, email` and filters on `(tenant_id, id)`, add `INCLUDE (name, email)` for index-only scans.

### When NOT to Index

- Table has < 10,000 rows (seq scan is faster than index lookup)
- Column is updated frequently (index maintenance overhead)
- Query is rare (< 100 calls/day in pg_stat_statements)
- Query is already < 10ms mean (not worth the write overhead)

---

## D. Migration Template

### File Naming

```
packages/db/migrations/{NNNN}_{snake_case_description}.sql
```

Where `{NNNN}` is the next idx from `packages/db/migrations/meta/_journal.json`.

### Template: Standard Index Migration

```sql
-- Migration: {NNNN}_performance_indexes_{description}.sql
-- Purpose: Add indexes for slow queries detected via pg_stat_statements audit
-- Date: YYYY-MM-DD
-- Report: reports/slow-query-audit-YYYY-MM-DD.txt

-- ===========================================================================
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- Drizzle migrations run inside a transaction by default.
--
-- Options:
--   1. Remove CONCURRENTLY and accept brief table lock (OK for < 1M rows)
--   2. Run as raw SQL outside Drizzle (recommended for production)
--      psql $DATABASE_URL -f packages/db/migrations/{NNNN}_xxx.sql
-- ===========================================================================

-- Index 1: orders by tenant + status + created_at
-- Reason: p95 250ms, 12,000 calls/day — order list page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_status_created
  ON orders (tenant_id, status, created_at DESC);

-- Index 2: tenders by tenant + order
-- Reason: Missing FK index, 45ms mean on order detail page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenders_tenant_order
  ON tenders (tenant_id, order_id);

-- Index 3: customer search by name (GIN trigram)
-- Reason: ILIKE search p95 380ms, 2,000 calls/day
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (display_name gin_trgm_ops);

-- Index 4: GL journal lines by period (partial)
-- Reason: Close checklist query p95 420ms
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gl_lines_tenant_posted
  ON gl_journal_lines (tenant_id, created_at DESC)
  WHERE journal_entry_id IS NOT NULL;
```

### Journal Entry

After creating the migration file, add an entry to `_journal.json`:

```json
{
  "idx": <next_idx>,
  "version": "7",
  "when": <unix_timestamp_ms>,
  "tag": "{NNNN}_{snake_case_description}",
  "breakpoints": true
}
```

### Running Migrations

```bash
# Local
pnpm db:migrate

# Production
pnpm db:migrate:remote
```

---

## E. Safety Checklist

### Before Creating the Migration

- [ ] Run `node tools/scripts/slow-query-audit.cjs --remote` to get current slow queries
- [ ] Verify the query is actually slow (p95 > 100ms, not just one spike)
- [ ] Verify the query has significant call volume (> 100/day)
- [ ] Check if an existing index already covers the columns (may just need reordering)
- [ ] Run `EXPLAIN ANALYZE` on the slow query locally to confirm seq scan

### Index Design

- [ ] `tenant_id` is the leading column for all tenant-scoped tables
- [ ] No standalone B-tree on low-cardinality columns (status, type, is_active)
- [ ] Partial index used where appropriate (e.g., `WHERE status = 'active'`)
- [ ] INCLUDE used for covering index opportunities
- [ ] Index name is descriptive: `idx_{table}_{columns}` (max 63 chars)
- [ ] `IF NOT EXISTS` for idempotency

### Deployment

- [ ] `CREATE INDEX CONCURRENTLY` used (avoids table-level lock)
- [ ] Note: CONCURRENTLY cannot run inside a transaction (Drizzle wraps migrations in transactions)
- [ ] For production: run as raw SQL via `psql`, not via `pnpm db:migrate:remote`
- [ ] Schedule during low-traffic window for tables > 10M rows
- [ ] Monitor `pg_stat_activity` during creation for lock contention
- [ ] If CONCURRENTLY fails midway, drop the `INVALID` index and retry:
  ```sql
  DROP INDEX CONCURRENTLY IF NOT EXISTS idx_name;
  ```

### After Deployment

- [ ] Wait 24 hours for stats to accumulate
- [ ] Re-run `node tools/scripts/slow-query-audit.cjs --remote` to verify improvement
- [ ] Check `pg_stat_user_indexes` — new index should have `idx_scan > 0`
- [ ] If `idx_scan = 0` after 7 days, the index is unused — drop it
- [ ] Reset stats: `SELECT pg_stat_statements_reset()` to get clean baseline

### Rollback

```sql
-- Safe rollback — CONCURRENTLY avoids locks
DROP INDEX CONCURRENTLY IF NOT EXISTS idx_name;
```

### Lock Risk Table

| DDL Command | Lock Level | Blocks Reads? | Blocks Writes? |
|-------------|-----------|---------------|----------------|
| `CREATE INDEX` | ShareLock | No | YES |
| `CREATE INDEX CONCURRENTLY` | ShareUpdateExclusiveLock | No | No |
| `DROP INDEX` | AccessExclusiveLock | YES | YES |
| `DROP INDEX CONCURRENTLY` | ShareUpdateExclusiveLock | No | No |
| `ALTER TABLE ADD COLUMN` | AccessExclusiveLock | YES | YES |
| `ALTER TABLE ADD COLUMN ... DEFAULT` (PG 11+) | AccessExclusiveLock (brief) | Brief | Brief |

### Connection Pool Awareness

OppsEra uses Supavisor (transaction pooling) with `max: 2` per Vercel instance:

- Never run long-running index builds from the app connection pool
- Use a direct connection (port 5432) for index creation, not the pooler (port 6543)
- `prepare: false` is required for Supavisor — but index creation via `psql` uses direct connections anyway

---

## Scheduling

### Weekly Workflow

1. **Monday**: Run `slow-query-audit.cjs --remote` — review report
2. **Tuesday**: Design and test indexes locally with `EXPLAIN ANALYZE`
3. **Wednesday**: Apply indexes on staging, run load tests
4. **Thursday**: Apply indexes on production during low-traffic window
5. **Friday**: Verify with `--remote --reset` to start clean stats for next week

### Automated (Future)

Add to Vercel Cron or GitHub Actions:

```yaml
# .github/workflows/slow-query-audit.yml
name: Weekly Slow Query Audit
on:
  schedule:
    - cron: '0 6 * * 1'  # Monday 6am UTC
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: node tools/scripts/slow-query-audit.cjs --remote
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - uses: actions/upload-artifact@v4
        with:
          name: slow-query-report
          path: reports/slow-query-audit-*.txt
```
