-- 0307: Attrition risk tracking — stores computed risk scores per tenant
-- with signal breakdowns and narrative summaries.
-- NO RLS — platform-level table accessed by admin only.
-- Each scoring run INSERTs new rows and supersedes previous open scores,
-- preserving full history for trend analysis.

CREATE TABLE IF NOT EXISTS attrition_risk_scores (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  overall_score   INTEGER NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  risk_level      TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  -- Individual signal scores (0-100)
  login_decline_score       INTEGER NOT NULL DEFAULT 0 CHECK (login_decline_score BETWEEN 0 AND 100),
  usage_decline_score       INTEGER NOT NULL DEFAULT 0 CHECK (usage_decline_score BETWEEN 0 AND 100),
  module_abandonment_score  INTEGER NOT NULL DEFAULT 0 CHECK (module_abandonment_score BETWEEN 0 AND 100),
  user_shrinkage_score      INTEGER NOT NULL DEFAULT 0 CHECK (user_shrinkage_score BETWEEN 0 AND 100),
  error_frustration_score   INTEGER NOT NULL DEFAULT 0 CHECK (error_frustration_score BETWEEN 0 AND 100),
  breadth_narrowing_score   INTEGER NOT NULL DEFAULT 0 CHECK (breadth_narrowing_score BETWEEN 0 AND 100),
  staleness_score           INTEGER NOT NULL DEFAULT 0 CHECK (staleness_score BETWEEN 0 AND 100),
  onboarding_stall_score    INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_stall_score BETWEEN 0 AND 100),
  -- Context
  signal_details  JSONB NOT NULL DEFAULT '{}',
  narrative       TEXT NOT NULL DEFAULT '',
  -- Tenant snapshot (denormalized for read-model performance)
  tenant_name     TEXT NOT NULL DEFAULT '',
  tenant_status   TEXT NOT NULL DEFAULT '',
  industry        TEXT,
  health_grade    TEXT CHECK (health_grade IS NULL OR health_grade IN ('A', 'B', 'C', 'D', 'F')),
  total_locations INTEGER NOT NULL DEFAULT 0 CHECK (total_locations >= 0),
  total_users     INTEGER NOT NULL DEFAULT 0 CHECK (total_users >= 0),
  active_modules  INTEGER NOT NULL DEFAULT 0 CHECK (active_modules >= 0),
  last_activity_at TIMESTAMPTZ,
  -- Lifecycle
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  review_notes    TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed', 'superseded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite: fetch latest scores for a tenant (history + current)
CREATE INDEX IF NOT EXISTS idx_attrition_tenant ON attrition_risk_scores (tenant_id, scored_at DESC);
-- Dashboard: current scores sorted by risk
CREATE INDEX IF NOT EXISTS idx_attrition_risk_level ON attrition_risk_scores (risk_level, overall_score DESC);
-- Filtering by review status
CREATE INDEX IF NOT EXISTS idx_attrition_status ON attrition_risk_scores (status, risk_level);
-- Timeline view
CREATE INDEX IF NOT EXISTS idx_attrition_scored_at ON attrition_risk_scores (scored_at DESC);
-- Compound cursor pagination: (overall_score DESC, scored_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_attrition_cursor ON attrition_risk_scores (overall_score DESC, scored_at DESC, id DESC);
