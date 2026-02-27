-- Migration 0214: GL dimension compound indexes
-- Replace single-column dimension indexes with tenant-prefixed compound indexes
-- for proper multi-tenant query performance.

-- gl_journal_lines doesn't have tenant_id — add it first
-- (lines inherit tenant from parent gl_journal_entries, but direct column
-- enables efficient multi-tenant dimension indexes)
ALTER TABLE gl_journal_lines ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Backfill tenant_id from parent journal entry
UPDATE gl_journal_lines l
  SET tenant_id = e.tenant_id
  FROM gl_journal_entries e
  WHERE l.journal_entry_id = e.id
    AND l.tenant_id IS NULL;

-- Drop old single-column indexes (created in migration 0207)
DROP INDEX IF EXISTS idx_gl_journal_lines_profit_center;
DROP INDEX IF EXISTS idx_gl_journal_lines_sub_department;
DROP INDEX IF EXISTS idx_gl_journal_lines_location;

-- Create compound indexes with tenant_id prefix for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_tenant_profit_center
  ON gl_journal_lines (tenant_id, profit_center_id)
  WHERE profit_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_tenant_sub_department
  ON gl_journal_lines (tenant_id, sub_department_id)
  WHERE sub_department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_tenant_channel
  ON gl_journal_lines (tenant_id, channel)
  WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_tenant_location
  ON gl_journal_lines (tenant_id, location_id)
  WHERE location_id IS NOT NULL;
