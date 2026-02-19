-- Migration 0063: Catalog Item Change Logs (Append-Only Audit Trail)
-- Immutable change log for catalog items — tracks field-level diffs per mutation.
-- APPEND-ONLY: Only SELECT + INSERT policies. No UPDATE or DELETE policies.

CREATE TABLE catalog_item_change_logs (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL,
  item_id             TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  action_type         TEXT NOT NULL CHECK (action_type IN (
    'CREATED', 'UPDATED', 'ARCHIVED', 'RESTORED',
    'COST_UPDATED', 'INVENTORY_ADJUSTED', 'IMPORTED'
  )),
  changed_by_user_id  TEXT NOT NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  source              TEXT NOT NULL CHECK (source IN ('UI', 'API', 'IMPORT', 'SYSTEM')),
  field_changes       JSONB NOT NULL DEFAULT '{}',
  summary             TEXT,
  notes               TEXT
);

-- Primary query: all logs for an item, newest first
CREATE INDEX idx_catalog_item_change_logs_lookup
  ON catalog_item_change_logs (tenant_id, item_id, changed_at DESC);

-- Filter by user
CREATE INDEX idx_catalog_item_change_logs_user
  ON catalog_item_change_logs (tenant_id, changed_by_user_id);

-- Filter by action type
CREATE INDEX idx_catalog_item_change_logs_action
  ON catalog_item_change_logs (tenant_id, action_type);

-- RLS: Append-only enforcement
-- Only SELECT and INSERT policies — UPDATE and DELETE are denied by default with RLS enabled.
ALTER TABLE catalog_item_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_item_change_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON catalog_item_change_logs
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_insert ON catalog_item_change_logs
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- NO UPDATE policy — denied by RLS
-- NO DELETE policy — denied by RLS
