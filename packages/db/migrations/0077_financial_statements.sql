-- Migration: 0077_financial_statements.sql
-- Financial statement layouts and templates

-- ── financial_statement_layouts ────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_statement_layouts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  statement_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_stmt_layouts_tenant_type_name
  ON financial_statement_layouts(tenant_id, statement_type, name);
CREATE INDEX IF NOT EXISTS idx_financial_stmt_layouts_tenant_type
  ON financial_statement_layouts(tenant_id, statement_type);

-- ── financial_statement_layout_templates ───────────────────────
CREATE TABLE IF NOT EXISTS financial_statement_layout_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  statement_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_financial_stmt_layout_templates_key
  ON financial_statement_layout_templates(template_key);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE financial_statement_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_statement_layouts FORCE ROW LEVEL SECURITY;

CREATE POLICY financial_statement_layouts_select ON financial_statement_layouts
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY financial_statement_layouts_insert ON financial_statement_layouts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY financial_statement_layouts_update ON financial_statement_layouts
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY financial_statement_layouts_delete ON financial_statement_layouts
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Templates are system-level (no tenant_id), no RLS needed
