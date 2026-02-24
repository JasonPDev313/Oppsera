-- F&B Sub-Department Revenue Integration
-- Adds sub_department_id to fnb_tab_items for catalog GL resolution
-- Adds sales_by_sub_department JSONB to fnb_close_batch_summaries

ALTER TABLE fnb_tab_items
  ADD COLUMN IF NOT EXISTS sub_department_id text;

CREATE INDEX IF NOT EXISTS idx_fnb_tab_items_subdept
  ON fnb_tab_items (tenant_id, sub_department_id)
  WHERE sub_department_id IS NOT NULL;

ALTER TABLE fnb_close_batch_summaries
  ADD COLUMN IF NOT EXISTS sales_by_sub_department jsonb;
