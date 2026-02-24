-- Migration: 0156_semantic_training_pairs
-- Description: RAG training pairs table for semantic pipeline
-- Uses pg_trgm (already enabled via migration 0062) for similarity search

CREATE TABLE IF NOT EXISTS semantic_training_pairs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),  -- null = global pair
  question TEXT NOT NULL,
  compiled_sql TEXT,
  plan JSONB,
  mode TEXT NOT NULL DEFAULT 'metrics',   -- 'metrics' | 'sql'
  quality_score NUMERIC(3,2),
  source TEXT NOT NULL DEFAULT 'auto',    -- 'auto' | 'admin' | 'thumbs_up'
  source_eval_turn_id TEXT REFERENCES semantic_eval_turns(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram similarity index for fuzzy question matching
CREATE INDEX IF NOT EXISTS idx_training_pairs_question_trgm
  ON semantic_training_pairs USING gin (question gin_trgm_ops);

-- Tenant + active filter for fast retrieval
CREATE INDEX IF NOT EXISTS idx_training_pairs_tenant_active
  ON semantic_training_pairs (tenant_id, is_active, quality_score DESC NULLS LAST);

-- Source eval turn dedup
CREATE INDEX IF NOT EXISTS idx_training_pairs_source_turn
  ON semantic_training_pairs (source_eval_turn_id)
  WHERE source_eval_turn_id IS NOT NULL;

-- RLS
ALTER TABLE semantic_training_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_training_pairs FORCE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  DROP POLICY IF EXISTS training_pairs_select ON semantic_training_pairs;
  CREATE POLICY training_pairs_select ON semantic_training_pairs
    FOR SELECT
    USING (
      tenant_id IS NULL  -- global pairs visible to all
      OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

  DROP POLICY IF EXISTS training_pairs_insert ON semantic_training_pairs;
  CREATE POLICY training_pairs_insert ON semantic_training_pairs
    FOR INSERT
    WITH CHECK (
      tenant_id IS NULL
      OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

  DROP POLICY IF EXISTS training_pairs_update ON semantic_training_pairs;
  CREATE POLICY training_pairs_update ON semantic_training_pairs
    FOR UPDATE
    USING (
      tenant_id IS NULL
      OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );

  DROP POLICY IF EXISTS training_pairs_delete ON semantic_training_pairs;
  CREATE POLICY training_pairs_delete ON semantic_training_pairs
    FOR DELETE
    USING (
      tenant_id IS NULL
      OR tenant_id = (SELECT current_setting('app.current_tenant_id', true))
    );
END $$;
