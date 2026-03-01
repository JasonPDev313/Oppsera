-- Distributed locks table for app-level worker coordination.
-- Row-based locks with TTL — immune to Supavisor connection pooling
-- (advisory locks are session-scoped and get released when connections
-- return to the pool).
--
-- No RLS — infrastructure table, not tenant-scoped.

CREATE TABLE IF NOT EXISTS distributed_locks (
  lock_key      TEXT PRIMARY KEY,
  holder_id     TEXT NOT NULL,
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Index for efficient expired lock cleanup
CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires
  ON distributed_locks (expires_at);

COMMENT ON TABLE distributed_locks IS 'Row-based distributed locks with TTL for worker coordination (no RLS — infrastructure table)';
COMMENT ON COLUMN distributed_locks.lock_key IS 'Well-known lock key (e.g., erp-cron, drain-outbox)';
COMMENT ON COLUMN distributed_locks.holder_id IS 'Unique identifier for the lock holder (e.g., Vercel instance ID + PID)';
COMMENT ON COLUMN distributed_locks.expires_at IS 'Lock auto-expires after this time (stale takeover)';
COMMENT ON COLUMN distributed_locks.metadata IS 'Optional context (trigger type, business date, etc.)';
