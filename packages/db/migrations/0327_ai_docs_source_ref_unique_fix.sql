-- Replace partial unique index with a full unique index on source_ref.
-- Drizzle's onConflictDoUpdate({ target: sourceRef }) generates
-- ON CONFLICT (source_ref) which only matches non-partial unique indexes.
-- NULLs are distinct in PostgreSQL unique indexes, so NULL source_ref is fine.
DROP INDEX IF EXISTS uq_ai_docs_source_ref;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_docs_source_ref
  ON ai_support_documents (source_ref);
