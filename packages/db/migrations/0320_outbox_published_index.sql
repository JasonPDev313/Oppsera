-- Index for outbox purge/recover queries that filter on published_at IS NOT NULL.
-- The existing partial index (idx_event_outbox_unpublished) only covers
-- published_at IS NULL — purge and stale-recovery queries had to seq-scan.
-- This caused 7–15s queries that exhausted the connection pool (max: 2),
-- triggering circuit-breaker cascades on user-facing routes.
CREATE INDEX IF NOT EXISTS idx_event_outbox_published
  ON event_outbox (published_at ASC, created_at ASC)
  WHERE published_at IS NOT NULL;
