-- UXOPS-09: F&B Batch Category Keys + Coverage Dashboard
-- Adds category_version to fnb_close_batch_summaries for tracking
-- which version of the category key set was used.

ALTER TABLE fnb_close_batch_summaries
  ADD COLUMN category_version INTEGER DEFAULT 1;

-- Backfill existing rows
UPDATE fnb_close_batch_summaries SET category_version = 1 WHERE category_version IS NULL;
