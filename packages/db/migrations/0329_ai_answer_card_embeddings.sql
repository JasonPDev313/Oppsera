-- 0329: Add vector embeddings + summary to answer cards for hybrid retrieval
-- Enables semantic matching via pgvector cosine similarity alongside existing keyword matching

-- Step 1: Add embedding and summary columns
ALTER TABLE ai_support_answer_cards
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS summary text;

-- Step 2: Create HNSW index for fast approximate nearest neighbor search
-- Cosine ops match our embedding model (text-embedding-3-small normalizes to unit vectors)
-- m=16, ef_construction=64 is optimal for <100k vectors
CREATE INDEX IF NOT EXISTS idx_ai_answer_cards_embedding
  ON ai_support_answer_cards
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 3: Partial index on status='active' + embedding IS NOT NULL
-- so vector search only scans active embedded cards
CREATE INDEX IF NOT EXISTS idx_ai_answer_cards_active_embedded
  ON ai_support_answer_cards (status)
  WHERE status = 'active' AND embedding IS NOT NULL;
