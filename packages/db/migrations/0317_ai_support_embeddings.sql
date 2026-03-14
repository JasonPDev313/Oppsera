-- Enable pgvector extension (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to documents table
ALTER TABLE ai_support_documents ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create vector similarity index
CREATE INDEX IF NOT EXISTS idx_ai_docs_embedding ON ai_support_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Embedding metadata tracking
CREATE TABLE IF NOT EXISTS ai_support_embeddings_meta (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ai_support_documents(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  dimensions INTEGER NOT NULL DEFAULT 1536,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_meta_doc ON ai_support_embeddings_meta(document_id);
