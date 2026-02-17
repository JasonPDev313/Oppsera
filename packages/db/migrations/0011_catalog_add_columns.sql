-- Migration: 0011_catalog_add_columns
-- Adds missing barcode, metadata columns to catalog_items
-- Adds missing is_default column to catalog_item_modifier_groups

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_items_tenant_barcode
  ON catalog_items (tenant_id, barcode) WHERE barcode IS NOT NULL;

ALTER TABLE catalog_item_modifier_groups
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
