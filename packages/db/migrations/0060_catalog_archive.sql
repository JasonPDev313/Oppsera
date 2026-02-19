-- Migration 0060: Add archive semantics to catalog_items
-- Adds archivedAt/archivedBy/archivedReason columns for proper archive vs deactivate distinction

ALTER TABLE catalog_items ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE catalog_items ADD COLUMN archived_by TEXT;
ALTER TABLE catalog_items ADD COLUMN archived_reason TEXT;

CREATE INDEX idx_catalog_items_tenant_archived ON catalog_items (tenant_id, archived_at);
