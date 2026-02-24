-- Migration 0142: Fix GL unique index to allow void + repost for remapping
-- Also adds resolution tracking columns to gl_unmapped_events

-- 1. Replace unique index to exclude voided entries
-- This allows void + repost to work naturally for GL remapping
DROP INDEX IF EXISTS uq_gl_journal_entries_tenant_src_ref;

CREATE UNIQUE INDEX uq_gl_journal_entries_tenant_src_ref
  ON gl_journal_entries (tenant_id, source_module, source_reference_id)
  WHERE source_reference_id IS NOT NULL AND status != 'voided';

-- 2. Track how unmapped events were resolved: 'manual' or 'remapped'
ALTER TABLE gl_unmapped_events
  ADD COLUMN IF NOT EXISTS resolution_method TEXT DEFAULT NULL;

-- 3. Link to the corrected GL entry when remapped
ALTER TABLE gl_unmapped_events
  ADD COLUMN IF NOT EXISTS remapped_journal_entry_id TEXT DEFAULT NULL;

-- 4. Index for efficient remap candidate lookup: unresolved events grouped by tender
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_source_ref_unresolved
  ON gl_unmapped_events (tenant_id, source_reference_id)
  WHERE resolved_at IS NULL AND source_reference_id IS NOT NULL;
