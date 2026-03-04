-- Partial index on event_outbox for unpublished events.
-- The drain-outbox cron only queries WHERE published_at IS NULL,
-- so a partial index avoids scanning the (growing) published rows.
CREATE INDEX IF NOT EXISTS idx_event_outbox_unpublished
  ON event_outbox (created_at ASC)
  WHERE published_at IS NULL;
