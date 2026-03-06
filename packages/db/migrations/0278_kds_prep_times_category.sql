-- Extend fnb_kds_item_prep_times to support category-level prep times.
-- A single category_id column covers all 3 hierarchy levels (dept/sub-dept/category)
-- since they are all rows in catalog_categories with self-referential parent_id.
-- No FK on category_id — cross-module boundary (catalog module owns catalog_categories).

-- 1. Make catalog_item_id nullable (existing rows keep their values)
ALTER TABLE fnb_kds_item_prep_times
  ALTER COLUMN catalog_item_id DROP NOT NULL;

-- 2. Add category_id column (no FK — cross-module ref, app-level integrity)
ALTER TABLE fnb_kds_item_prep_times
  ADD COLUMN IF NOT EXISTS category_id text;

-- 3. Enforce exactly one target: item XOR category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_prep_time_target'
      AND conrelid = 'fnb_kds_item_prep_times'::regclass
  ) THEN
    ALTER TABLE fnb_kds_item_prep_times
      ADD CONSTRAINT chk_prep_time_target CHECK (
        (catalog_item_id IS NOT NULL AND category_id IS NULL)
        OR
        (catalog_item_id IS NULL AND category_id IS NOT NULL)
      );
  END IF;
END $$;

-- 4. Drop old monolithic unique index (item-only, non-partial)
DROP INDEX IF EXISTS uq_fnb_kds_item_prep_times;

-- 5. Partial unique index for item-based rows
CREATE UNIQUE INDEX IF NOT EXISTS uidx_prep_time_item
  ON fnb_kds_item_prep_times (tenant_id, catalog_item_id, COALESCE(station_id, ''))
  WHERE catalog_item_id IS NOT NULL;

-- 6. Partial unique index for category-based rows
CREATE UNIQUE INDEX IF NOT EXISTS uidx_prep_time_category
  ON fnb_kds_item_prep_times (tenant_id, category_id, COALESCE(station_id, ''))
  WHERE category_id IS NOT NULL;

-- 7. Runtime lookup index for category_id
CREATE INDEX IF NOT EXISTS idx_fnb_item_prep_times_category
  ON fnb_kds_item_prep_times (tenant_id, category_id)
  WHERE category_id IS NOT NULL;
