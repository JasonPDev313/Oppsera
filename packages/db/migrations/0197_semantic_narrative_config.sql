-- Migration 0197: Semantic Narrative Config
-- Stores the editable OPPS ERA LENS prompt template (platform-wide, single row)

CREATE TABLE IF NOT EXISTS semantic_narrative_config (
  id            TEXT        PRIMARY KEY DEFAULT 'global',
  prompt_template TEXT      NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- No RLS — this is a platform-wide table accessed only by admin routes
