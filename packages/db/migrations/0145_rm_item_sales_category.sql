-- Migration 0145: Add category_name to rm_item_sales for category-level reporting
-- The semantic layer (AI Insights) needs category-level aggregation.
-- Populated by the reporting consumer from order event data.

ALTER TABLE rm_item_sales ADD COLUMN IF NOT EXISTS category_name TEXT;

-- Index for GROUP BY category_name queries from the semantic layer
CREATE INDEX IF NOT EXISTS idx_rm_item_sales_tenant_category
  ON rm_item_sales (tenant_id, category_name)
  WHERE category_name IS NOT NULL;
