-- UXOPS-10: Dead Letter Queue for failed events
-- Persists events that exhausted retries for admin inspection and retry

CREATE TABLE event_dead_letters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  consumer_name TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'failed',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_dead_letters_status ON event_dead_letters(tenant_id, status);
CREATE INDEX idx_dead_letters_type ON event_dead_letters(event_type, status);
CREATE INDEX idx_dead_letters_consumer ON event_dead_letters(consumer_name, status);
CREATE INDEX idx_dead_letters_created ON event_dead_letters(created_at DESC);

-- No RLS on this table — accessed by platform admins and system processes only
