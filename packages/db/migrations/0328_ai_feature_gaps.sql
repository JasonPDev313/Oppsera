-- Feature Gap Detection for AI Support
-- Automatically captures questions the AI assistant cannot answer (low confidence / no evidence)
-- and clusters them by normalized question text for backlog prioritization.

CREATE TABLE IF NOT EXISTS ai_support_feature_gaps (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT REFERENCES tenants(id),
  -- Clustering
  question_normalized TEXT NOT NULL,
  question_hash     TEXT NOT NULL,              -- SHA-256 of normalized question for fast dedup
  module_key        TEXT,
  route             TEXT,
  -- Frequency tracking
  occurrence_count  INTEGER NOT NULL DEFAULT 1,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Sample data (latest example)
  sample_question   TEXT NOT NULL,              -- Original user question text
  sample_thread_id  TEXT,                       -- Link to a representative thread
  sample_confidence TEXT,                       -- 'low' typically
  -- Status workflow
  status            TEXT NOT NULL DEFAULT 'open',  -- open | under_review | planned | shipped | dismissed
  priority          TEXT NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  admin_notes       TEXT,
  -- Link to feature_requests if promoted
  feature_request_id TEXT,
  -- Audit
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast dedup lookup: tenant + question hash
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_feature_gaps_hash
  ON ai_support_feature_gaps (COALESCE(tenant_id, '__global__'), question_hash);

-- Filter by status for admin dashboard
CREATE INDEX IF NOT EXISTS idx_ai_feature_gaps_status
  ON ai_support_feature_gaps (status);

-- Sort by frequency for prioritization
CREATE INDEX IF NOT EXISTS idx_ai_feature_gaps_frequency
  ON ai_support_feature_gaps (occurrence_count DESC, last_seen_at DESC);

-- Filter by module
CREATE INDEX IF NOT EXISTS idx_ai_feature_gaps_module
  ON ai_support_feature_gaps (module_key);

-- Tenant scoping
CREATE INDEX IF NOT EXISTS idx_ai_feature_gaps_tenant
  ON ai_support_feature_gaps (tenant_id);

-- RLS policy (admin-only table, but add basic tenant isolation)
ALTER TABLE ai_support_feature_gaps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_feature_gaps_tenant_isolation') THEN
    CREATE POLICY ai_feature_gaps_tenant_isolation
      ON ai_support_feature_gaps
      FOR ALL
      USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
