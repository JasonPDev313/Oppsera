-- Migration 0244: Register Tab Sync Foundation
-- Adds optimistic locking, location awareness, status tracking,
-- device/presence tracking, and metadata to register_tabs.

-- 1. Version column for optimistic locking
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 2. Location ID for cross-terminal queries at the same location
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS location_id TEXT;

-- 3. Status (active, held, closed) — soft-delete instead of hard DELETE
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE register_tabs ADD CONSTRAINT chk_register_tabs_status
    CHECK (status IN ('active', 'held', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Device ID for presence tracking (browser fingerprint / terminal device ID)
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 5. Last activity timestamp for presence/heartbeat
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Metadata JSONB for extensibility
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 7. Covering index for cross-terminal delta sync queries
CREATE INDEX IF NOT EXISTS idx_register_tabs_location_updated
  ON register_tabs (tenant_id, location_id, updated_at);

-- 8. Partial index for active tabs (most queries filter to active)
CREATE INDEX IF NOT EXISTS idx_register_tabs_active
  ON register_tabs (tenant_id, terminal_id, tab_number)
  WHERE status = 'active';

-- 9. RLS policies for new columns (register_tabs already has RLS from initial migration)
-- No additional RLS needed — existing tenant_id policies cover all columns.
