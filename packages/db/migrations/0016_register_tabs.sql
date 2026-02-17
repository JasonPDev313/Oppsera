-- Migration: 0016_register_tabs
-- Server-persisted register tabs for POS terminals

-- ── register_tabs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS register_tabs (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  terminal_id    TEXT NOT NULL,
  tab_number     INTEGER NOT NULL,
  order_id       TEXT,
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_register_tabs_terminal_tab ON register_tabs (tenant_id, terminal_id, tab_number);
CREATE INDEX idx_register_tabs_tenant_terminal ON register_tabs (tenant_id, terminal_id);

-- ── RLS Policies ────────────────────────────────────────────────
ALTER TABLE register_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY register_tabs_select ON register_tabs FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_tabs_insert ON register_tabs FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_tabs_update ON register_tabs FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY register_tabs_delete ON register_tabs FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
