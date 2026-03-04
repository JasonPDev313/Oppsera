-- Optimize gl_journal_lines RLS policies to use direct tenant_id column.
--
-- Migration 0075 created RLS policies that JOIN to gl_journal_entries to check
-- tenant_id. Migration 0214 added tenant_id directly to gl_journal_lines.
-- This migration replaces the JOIN-based policies with direct column checks,
-- eliminating a per-row subquery during RLS evaluation.

-- Drop the old JOIN-based policies
DROP POLICY IF EXISTS gl_journal_lines_select ON gl_journal_lines;
DROP POLICY IF EXISTS gl_journal_lines_insert ON gl_journal_lines;

-- Create optimized policies using the direct tenant_id column
CREATE POLICY gl_journal_lines_select ON gl_journal_lines FOR SELECT
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_journal_lines_insert ON gl_journal_lines FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
