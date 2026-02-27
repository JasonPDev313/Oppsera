-- Migration 0216: Add 'locked' access mode to entitlements
-- Adds CHECK constraint ensuring access_mode is one of the valid values

-- Drop existing constraint if present (idempotent)
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS chk_access_mode;

-- Add CHECK constraint for valid access modes
ALTER TABLE entitlements ADD CONSTRAINT chk_access_mode
  CHECK (access_mode IN ('off', 'view', 'full', 'locked'));
