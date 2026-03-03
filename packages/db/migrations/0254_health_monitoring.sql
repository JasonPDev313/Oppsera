-- Migration 0254: Tenant health monitoring + system metrics
-- Phase 2A Session 7 — health scoring and system dashboard

-- ── tenant_health_snapshots ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_health_snapshots (
  id text NOT NULL DEFAULT gen_ulid(),
  tenant_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- Activity metrics
  orders_24h integer NOT NULL DEFAULT 0,
  active_users_24h integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  last_login_at timestamptz,

  -- Error metrics
  error_count_24h integer NOT NULL DEFAULT 0,
  error_count_1h integer NOT NULL DEFAULT 0,
  dlq_depth integer NOT NULL DEFAULT 0,
  dlq_unresolved_over_24h integer NOT NULL DEFAULT 0,

  -- System metrics
  background_job_failures_24h integer NOT NULL DEFAULT 0,
  integration_error_count_24h integer NOT NULL DEFAULT 0,
  avg_response_time_ms numeric(10,2),
  p95_response_time_ms numeric(10,2),

  -- GL / Financial health
  unposted_gl_entries integer NOT NULL DEFAULT 0,
  unmapped_gl_events integer NOT NULL DEFAULT 0,
  open_close_batches integer NOT NULL DEFAULT 0,

  -- Computed grade
  health_grade text NOT NULL DEFAULT 'A'
    CHECK (health_grade IN ('A', 'B', 'C', 'D', 'F')),
  health_score integer NOT NULL DEFAULT 100,
  grade_factors jsonb NOT NULL DEFAULT '[]',

  CONSTRAINT tenant_health_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_health_snapshots_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_health_snapshots_latest
  ON tenant_health_snapshots(tenant_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_health_snapshots_grade
  ON tenant_health_snapshots(health_grade, captured_at DESC);

-- ── system_metrics_snapshots ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_metrics_snapshots (
  id text NOT NULL DEFAULT gen_ulid(),
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- Global activity
  total_orders_today integer NOT NULL DEFAULT 0,
  total_orders_1h integer NOT NULL DEFAULT 0,
  active_tenants_today integer NOT NULL DEFAULT 0,
  active_users_today integer NOT NULL DEFAULT 0,

  -- Error rates
  total_errors_1h integer NOT NULL DEFAULT 0,
  total_dlq_depth integer NOT NULL DEFAULT 0,
  total_dlq_unresolved integer NOT NULL DEFAULT 0,

  -- System resources (from existing system_health_snapshots)
  db_connection_count integer,
  db_max_connections integer,
  db_cache_hit_pct numeric(5,2),
  db_size_bytes bigint,

  -- Background jobs
  queued_jobs integer NOT NULL DEFAULT 0,
  failed_jobs_1h integer NOT NULL DEFAULT 0,
  stuck_consumers integer NOT NULL DEFAULT 0,

  -- Tenants by grade
  tenants_grade_a integer NOT NULL DEFAULT 0,
  tenants_grade_b integer NOT NULL DEFAULT 0,
  tenants_grade_c integer NOT NULL DEFAULT 0,
  tenants_grade_d integer NOT NULL DEFAULT 0,
  tenants_grade_f integer NOT NULL DEFAULT 0,

  CONSTRAINT system_metrics_snapshots_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_snapshots_captured
  ON system_metrics_snapshots(captured_at DESC);
