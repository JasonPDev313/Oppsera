-- Migration 0243: Performance indexes for gl_unmapped_events
-- Addresses slow loading of unmapped events list and remappable tenders query

-- Primary index: unresolved events per tenant, sorted by id DESC for cursor pagination
-- Covers the most common query: list unresolved events with ORDER BY id DESC
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_tenant_unresolved_id
  ON gl_unmapped_events(tenant_id, id DESC)
  WHERE resolved_at IS NULL;

-- Covering index for the list query: includes all selected columns to enable index-only scans
-- The list query selects: event_type, source_module, source_reference_id, entity_type, entity_id, reason, created_at
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_tenant_unresolved_covering
  ON gl_unmapped_events(tenant_id, id DESC)
  INCLUDE (event_type, source_module, source_reference_id, entity_type, entity_id, reason, created_at)
  WHERE resolved_at IS NULL;

-- Index for remappable tenders grouping: groups by source_reference_id for the getRemappableTenders query
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_tenant_source_ref_unresolved
  ON gl_unmapped_events(tenant_id, source_reference_id, source_module)
  WHERE resolved_at IS NULL AND source_reference_id IS NOT NULL;
