-- Add missing unique index on ai_support_documents.source_ref
-- Required by the git indexer's ON CONFLICT upsert logic.
-- Uses WHERE source_ref IS NOT NULL to allow NULL source_ref rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_docs_source_ref
  ON ai_support_documents (source_ref)
  WHERE source_ref IS NOT NULL;
