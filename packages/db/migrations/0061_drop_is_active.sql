-- Migration 0061: Unify isActive + archivedAt into single concept
-- archivedAt IS NULL = Active, archivedAt IS NOT NULL = Inactive

-- Step 1: Migrate any items that are isActive=false but NOT already archived
UPDATE catalog_items
SET archived_at = NOW(), archived_reason = 'Migrated from isActive=false'
WHERE is_active = false AND archived_at IS NULL;

-- Step 2: Drop the column and its index
DROP INDEX IF EXISTS idx_catalog_items_active;
ALTER TABLE catalog_items DROP COLUMN is_active;
