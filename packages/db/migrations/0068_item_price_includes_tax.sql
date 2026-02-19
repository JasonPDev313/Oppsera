-- Migration 0068: Move tax inclusive/exclusive from tax_groups to catalog_items
--
-- Tax groups define WHAT taxes apply. Items define HOW the price is interpreted.
-- This migration adds price_includes_tax to catalog_items and backfills from
-- the tax group calculation_mode that will be dropped in 0069.

-- Step 1: Add column with default false (most items use exclusive pricing)
ALTER TABLE catalog_items
  ADD COLUMN price_includes_tax BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Backfill from existing tax group assignments
-- Items assigned to ANY inclusive tax group get price_includes_tax = true
UPDATE catalog_items ci
SET price_includes_tax = true
WHERE EXISTS (
  SELECT 1
  FROM catalog_item_location_tax_groups ciltg
  JOIN tax_groups tg ON tg.id = ciltg.tax_group_id
  WHERE ciltg.catalog_item_id = ci.id
    AND ciltg.tenant_id = ci.tenant_id
    AND tg.calculation_mode = 'inclusive'
);
