-- Migration 0165: AI World-Class Features
-- Adds pinned metrics, annotations, conversation branches, scheduled reports, and embed tokens
-- All tables are multi-tenant with RLS (defense-in-depth)

-- ── 1. Pinned Metrics (user watchlist) ─────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_pinned_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  metric_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, metric_slug)
);

-- ── 2. Annotations on data points ─────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_annotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  metric_slug TEXT,
  dimension_value TEXT,
  annotation_date DATE,
  text TEXT NOT NULL,
  annotation_type TEXT NOT NULL DEFAULT 'note',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Conversation branches (forked threads) ─────────────────────
CREATE TABLE IF NOT EXISTS semantic_conversation_branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  parent_session_id TEXT NOT NULL,
  parent_turn_number INTEGER NOT NULL,
  branch_session_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Scheduled report delivery configs ───────────────────────────
CREATE TABLE IF NOT EXISTS semantic_scheduled_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'digest',
  frequency TEXT NOT NULL DEFAULT 'daily',
  delivery_hour INTEGER NOT NULL DEFAULT 8,
  delivery_day_of_week INTEGER,
  delivery_day_of_month INTEGER,
  recipient_type TEXT NOT NULL DEFAULT 'self',
  recipient_role_ids TEXT[],
  recipient_user_ids TEXT[],
  channel TEXT NOT NULL DEFAULT 'in_app',
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivered_at TIMESTAMPTZ,
  next_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Embeddable widget tokens ────────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_embed_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  created_by TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  widget_type TEXT NOT NULL DEFAULT 'metric_card',
  config JSONB NOT NULL DEFAULT '{}',
  allowed_origins TEXT[],
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_semantic_pinned_metrics_tenant_user
  ON semantic_pinned_metrics(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_semantic_annotations_tenant_metric
  ON semantic_annotations(tenant_id, metric_slug, annotation_date);

CREATE INDEX IF NOT EXISTS idx_semantic_branches_tenant_parent
  ON semantic_conversation_branches(tenant_id, parent_session_id);

CREATE INDEX IF NOT EXISTS idx_semantic_scheduled_tenant_active
  ON semantic_scheduled_reports(tenant_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_semantic_scheduled_frequency
  ON semantic_scheduled_reports(frequency, delivery_hour) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_semantic_embed_token
  ON semantic_embed_tokens(token) WHERE is_active = true;

-- ── RLS Policies (subquery-wrapped current_setting per gotcha #232) ──

-- Pinned Metrics
ALTER TABLE semantic_pinned_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_pinned_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_pinned_metrics_tenant_isolation ON semantic_pinned_metrics;
CREATE POLICY semantic_pinned_metrics_tenant_isolation ON semantic_pinned_metrics
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- Annotations
ALTER TABLE semantic_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_annotations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_annotations_tenant_isolation ON semantic_annotations;
CREATE POLICY semantic_annotations_tenant_isolation ON semantic_annotations
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- Conversation Branches
ALTER TABLE semantic_conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_conversation_branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_branches_tenant_isolation ON semantic_conversation_branches;
CREATE POLICY semantic_branches_tenant_isolation ON semantic_conversation_branches
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- Scheduled Reports
ALTER TABLE semantic_scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_scheduled_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_scheduled_tenant_isolation ON semantic_scheduled_reports;
CREATE POLICY semantic_scheduled_tenant_isolation ON semantic_scheduled_reports
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

-- Embed Tokens
ALTER TABLE semantic_embed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_embed_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_embed_tenant_isolation ON semantic_embed_tokens;
CREATE POLICY semantic_embed_tenant_isolation ON semantic_embed_tokens
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
