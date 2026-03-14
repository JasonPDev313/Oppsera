-- Add unique index on ai_support_documents(source_ref) to enable ON CONFLICT upserts.
-- Deduplicate any existing rows first (keep the most recently indexed one).
DELETE FROM ai_support_documents a
  USING ai_support_documents b
  WHERE a.source_ref = b.source_ref
    AND a.source_ref IS NOT NULL
    AND a.indexed_at < b.indexed_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_docs_source_ref
  ON ai_support_documents (source_ref)
  WHERE source_ref IS NOT NULL;
