-- Migration 0069: Drop calculation_mode from tax_groups
--
-- Tax groups now only define which rates apply at a location.
-- Whether the price includes tax is determined by catalog_items.price_includes_tax.

ALTER TABLE tax_groups DROP COLUMN IF EXISTS calculation_mode;
