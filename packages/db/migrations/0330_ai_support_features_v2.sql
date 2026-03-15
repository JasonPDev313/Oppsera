-- Migration 0330: AI Support Features V2
-- Adds tables for: escalations (handoff), agentic action log, CSAT predictions,
-- sentiment column, test suite, conversation tags, proactive rules, thread summary

-- ══════════════════════════════════════════════════════════════════════
-- 1. Escalations (Human Agent Handoff)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_escalations (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  thread_id       TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  summary         TEXT,
  reason          TEXT NOT NULL DEFAULT 'user_requested',
  status          TEXT NOT NULL DEFAULT 'open',
  priority        TEXT NOT NULL DEFAULT 'medium',
  assigned_to     TEXT,
  resolution_notes TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_escalations_tenant_status
  ON ai_support_escalations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_escalations_thread
  ON ai_support_escalations (thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_escalations_created
  ON ai_support_escalations (created_at);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Agentic Action Audit Log
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_agentic_actions (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  thread_id       TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  message_id      TEXT REFERENCES ai_assistant_messages(id) ON DELETE SET NULL,
  action_name     TEXT NOT NULL,
  action_params   JSONB,
  action_result   JSONB,
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agentic_actions_thread
  ON ai_support_agentic_actions (thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_agentic_actions_tenant
  ON ai_support_agentic_actions (tenant_id, created_at);

-- ══════════════════════════════════════════════════════════════════════
-- 3. CSAT Predictions
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_csat_predictions (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  thread_id       TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  score           INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  reasoning       TEXT,
  model_used      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_csat_thread
  ON ai_support_csat_predictions (thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_csat_tenant_created
  ON ai_support_csat_predictions (tenant_id, created_at);

-- ══════════════════════════════════════════════════════════════════════
-- 4. Sentiment column on messages
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE ai_assistant_messages
  ADD COLUMN IF NOT EXISTS sentiment TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_messages_sentiment
  ON ai_assistant_messages (tenant_id, sentiment)
  WHERE sentiment IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 5. Test Suite (Simulation)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_test_cases (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  question                TEXT NOT NULL,
  expected_answer_pattern TEXT NOT NULL,
  module_key              TEXT,
  route                   TEXT,
  tags                    JSONB DEFAULT '[]'::jsonb,
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_support_test_runs (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  total_cases     INTEGER NOT NULL DEFAULT 0,
  passed          INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  regressed       INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_support_test_results (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  run_id          TEXT NOT NULL REFERENCES ai_support_test_runs(id) ON DELETE CASCADE,
  test_case_id    TEXT NOT NULL REFERENCES ai_support_test_cases(id) ON DELETE CASCADE,
  actual_answer   TEXT,
  confidence      TEXT,
  source_tier     TEXT,
  passed          BOOLEAN NOT NULL DEFAULT false,
  regression      BOOLEAN NOT NULL DEFAULT false,
  score           NUMERIC(5,4) DEFAULT 0,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_results_run
  ON ai_support_test_results (run_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_case
  ON ai_support_test_results (test_case_id);

-- ══════════════════════════════════════════════════════════════════════
-- 6. Thread summary column
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE ai_assistant_threads
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- 7. Conversation Tags (Auto-Tagging / Intent Classification)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_conversation_tags (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  thread_id       TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  tag_type        TEXT NOT NULL,
  tag_value       TEXT NOT NULL,
  confidence      NUMERIC(3,2) DEFAULT 0.8,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_tags_thread
  ON ai_support_conversation_tags (thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_tags_tenant_type
  ON ai_support_conversation_tags (tenant_id, tag_type);
CREATE INDEX IF NOT EXISTS idx_ai_conv_tags_value
  ON ai_support_conversation_tags (tag_value);

-- ══════════════════════════════════════════════════════════════════════
-- 8. Proactive Rules
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_support_proactive_rules (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT REFERENCES tenants(id),
  trigger_type      TEXT NOT NULL,
  trigger_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_template  TEXT NOT NULL,
  module_key        TEXT,
  route_pattern     TEXT,
  priority          INTEGER NOT NULL DEFAULT 0,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  max_shows_per_user INTEGER NOT NULL DEFAULT 1,
  cooldown_hours    INTEGER NOT NULL DEFAULT 24,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_proactive_rules_enabled
  ON ai_support_proactive_rules (enabled, trigger_type);
CREATE INDEX IF NOT EXISTS idx_ai_proactive_rules_tenant
  ON ai_support_proactive_rules (tenant_id);

-- Track which proactive messages have been shown to which users
CREATE TABLE IF NOT EXISTS ai_support_proactive_dismissals (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  rule_id         TEXT NOT NULL REFERENCES ai_support_proactive_rules(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  shown_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_proactive_dismissal_user_rule
  ON ai_support_proactive_dismissals (rule_id, user_id, tenant_id);
