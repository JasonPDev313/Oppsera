-- Migration 0333: Add default tax group to locations
-- Provides a fallback tax rate for service charges and other non-catalog
-- taxable items when no line-item tax rates are available on the order.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS default_tax_group_id TEXT;

COMMENT ON COLUMN locations.default_tax_group_id IS
  'Default tax group for this location. Used as fallback for service charge tax and other non-catalog taxable items.';
