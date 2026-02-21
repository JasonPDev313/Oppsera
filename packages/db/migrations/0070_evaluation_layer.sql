-- Migration: 0070_evaluation_layer.sql
-- Evaluation infrastructure for the semantic/LLM layer
-- Captures every interaction for quality measurement, user feedback, and admin review

-- ── semantic_eval_sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_eval_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT,
  session_id TEXT,   -- FK to ai_conversations if applicable
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  avg_user_rating NUMERIC(3,2),
  avg_admin_score NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','flagged','reviewed')),
  lens_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE semantic_eval_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_eval_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "eval_sessions_tenant_isolation" ON semantic_eval_sessions
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_eval_sessions_tenant_user
  ON semantic_eval_sessions (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_eval_sessions_tenant_status
  ON semantic_eval_sessions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_eval_sessions_session_id
  ON semantic_eval_sessions (session_id) WHERE session_id IS NOT NULL;

-- ── semantic_eval_turns ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_eval_turns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  session_id TEXT NOT NULL REFERENCES semantic_eval_sessions(id) ON DELETE CASCADE,
  user_id TEXT,
  user_role TEXT,
  turn_number INTEGER NOT NULL DEFAULT 1,

  -- Input capture
  user_message TEXT NOT NULL,
  context_snapshot JSONB,

  -- LLM plan capture
  llm_provider TEXT,
  llm_model TEXT,
  llm_plan JSONB,
  llm_rationale JSONB,
  llm_confidence NUMERIC(3,2),
  llm_tokens_input INTEGER,
  llm_tokens_output INTEGER,
  llm_latency_ms INTEGER,
  plan_hash TEXT,
  was_clarification BOOLEAN NOT NULL DEFAULT FALSE,
  clarification_message TEXT,

  -- Compilation capture
  compiled_sql TEXT,
  sql_hash TEXT,
  compilation_errors JSONB,
  safety_flags JSONB,
  tables_accessed JSONB,

  -- Execution capture
  execution_time_ms INTEGER,
  row_count INTEGER,
  result_sample JSONB,
  result_fingerprint JSONB,
  execution_error TEXT,
  cache_status TEXT CHECK (cache_status IN ('HIT','MISS','SKIP')),

  -- Response capture
  narrative TEXT,
  narrative_lens_id TEXT,
  response_sections JSONB,
  playbooks_fired JSONB,

  -- User feedback
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_thumbs_up BOOLEAN,
  user_feedback_text TEXT,
  user_feedback_tags JSONB,
  user_feedback_at TIMESTAMPTZ,

  -- Admin review
  admin_reviewer_id TEXT,
  admin_score INTEGER CHECK (admin_score BETWEEN 1 AND 5),
  admin_verdict TEXT CHECK (admin_verdict IN ('correct','partially_correct','incorrect','hallucination','needs_improvement')),
  admin_notes TEXT,
  admin_corrected_plan JSONB,
  admin_corrected_narrative TEXT,
  admin_reviewed_at TIMESTAMPTZ,
  admin_action_taken TEXT CHECK (admin_action_taken IN ('none','added_to_examples','adjusted_metric','filed_bug','updated_lens')),

  -- Quality signals
  quality_score NUMERIC(3,2),
  quality_flags JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE semantic_eval_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_eval_turns FORCE ROW LEVEL SECURITY;

CREATE POLICY "eval_turns_tenant_isolation" ON semantic_eval_turns
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_eval_turns_tenant_session
  ON semantic_eval_turns (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_eval_turns_tenant_created
  ON semantic_eval_turns (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_turns_user_rating
  ON semantic_eval_turns (tenant_id, user_rating) WHERE user_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eval_turns_admin_verdict
  ON semantic_eval_turns (tenant_id, admin_verdict) WHERE admin_verdict IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eval_turns_quality_score
  ON semantic_eval_turns (tenant_id, quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eval_turns_plan_hash
  ON semantic_eval_turns (plan_hash) WHERE plan_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eval_turns_sql_hash
  ON semantic_eval_turns (sql_hash) WHERE sql_hash IS NOT NULL;

-- ── semantic_eval_examples ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_eval_examples (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),   -- NULL = system-wide
  source_eval_turn_id TEXT REFERENCES semantic_eval_turns(id),
  question TEXT NOT NULL,
  plan JSONB NOT NULL,
  rationale JSONB,
  category TEXT NOT NULL
    CHECK (category IN ('sales','golf','inventory','customer','comparison','trend','anomaly')),
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('simple','medium','complex')),
  quality_score NUMERIC(3,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE semantic_eval_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_eval_examples FORCE ROW LEVEL SECURITY;

-- System examples (tenant_id IS NULL) are visible to everyone; tenant examples only to that tenant
CREATE POLICY "eval_examples_tenant_isolation" ON semantic_eval_examples
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

CREATE INDEX IF NOT EXISTS idx_eval_examples_tenant_category
  ON semantic_eval_examples (tenant_id, category, is_active);
CREATE INDEX IF NOT EXISTS idx_eval_examples_active
  ON semantic_eval_examples (is_active, quality_score DESC) WHERE is_active = TRUE;

-- ── semantic_eval_quality_daily ─────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_eval_quality_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  business_date DATE NOT NULL,
  total_turns INTEGER NOT NULL DEFAULT 0,
  avg_user_rating NUMERIC(3,2),
  avg_admin_score NUMERIC(3,2),
  avg_confidence NUMERIC(3,2),
  avg_execution_time_ms INTEGER,
  clarification_rate NUMERIC(5,2),
  error_rate NUMERIC(5,2),
  hallucination_rate NUMERIC(5,2),
  cache_hit_rate NUMERIC(5,2),
  top_failure_reasons JSONB,
  rating_distribution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, business_date)
);

ALTER TABLE semantic_eval_quality_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_eval_quality_daily FORCE ROW LEVEL SECURITY;

CREATE POLICY "eval_quality_daily_tenant_isolation" ON semantic_eval_quality_daily
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_eval_quality_daily_tenant_date
  ON semantic_eval_quality_daily (tenant_id, business_date DESC);
