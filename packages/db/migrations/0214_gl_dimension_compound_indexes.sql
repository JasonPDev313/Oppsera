-- Migration 0214: GL dimension compound indexes
-- Replace single-column dimension indexes with tenant-prefixed compound indexes
-- for proper multi-tenant query performance.

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
