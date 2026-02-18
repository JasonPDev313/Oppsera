-- Migration 0048: Observability Infrastructure
-- Tables for system health snapshots, monitoring logs, and request logging

-- ── system_health_snapshots ──────────────────────────────────────────
-- Daily database health snapshots for trend analysis.
-- Written by the automated database health check job.
CREATE TABLE IF NOT EXISTS system_health_snapshots (
  id                    serial PRIMARY KEY,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  connection_count      integer,
  max_connections       integer,
  connection_util_pct   integer,
  cache_hit_pct         numeric(5,2),
  total_db_size_bytes   bigint,
  top_tables            jsonb,        -- array of { table, total_size, row_count }
  bloat_report          jsonb,        -- array of { table, dead_pct, dead_tuples }
  slow_queries          jsonb,        -- array of { query_preview, mean_ms, calls }
  seq_scan_report       jsonb,        -- array of { table, seq_scan, idx_scan_pct }
  alerts                jsonb         -- array of { metric, level, message }
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_captured
  ON system_health_snapshots (captured_at DESC);

-- ── request_log (optional — for tenants with enhanced logging) ──────
-- Structured request log for admin dashboard queries.
-- NOTE: Primary logging goes to stdout (Vercel log drain).
-- This table is a secondary sink for cross-tenant analytics.
CREATE TABLE IF NOT EXISTS request_log (
  id                    text PRIMARY KEY DEFAULT gen_ulid(),
  request_id            text NOT NULL,
  tenant_id             text,
  user_id               text,
  method                text NOT NULL,
  path                  text NOT NULL,
  status_code           integer NOT NULL,
  duration_ms           integer,
  db_query_count        integer,
  db_query_time_ms      integer,
  cold_start            boolean DEFAULT false,
  region                text,
  error_code            text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_log_tenant_created
  ON request_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_log_status_created
  ON request_log (status_code, created_at DESC)
  WHERE status_code >= 500;

CREATE INDEX IF NOT EXISTS idx_request_log_created
  ON request_log (created_at DESC);

-- Auto-cleanup: keep only 30 days of request logs
-- (run as periodic job or use pg_partman if needed)

-- ── alert_log ────────────────────────────────────────────────────────
-- Persistent log of all alerts sent, for dedup analysis and audit.
CREATE TABLE IF NOT EXISTS alert_log (
  id                    serial PRIMARY KEY,
  level                 text NOT NULL,    -- P0, P1, P2, P3
  title                 text NOT NULL,
  details               text,
  tenant_id             text,
  context               jsonb,
  sent_at               timestamptz NOT NULL DEFAULT now(),
  channel               text              -- slack, email, log
);

CREATE INDEX IF NOT EXISTS idx_alert_log_level_sent
  ON alert_log (level, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_log_sent
  ON alert_log (sent_at DESC);
