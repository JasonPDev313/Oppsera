-- ═══════════════════════════════════════════════════════════════════
-- Migration 0091: F&B Tab Items (Line Items)
-- Adds the fnb_tab_items table for tracking items ordered on a tab.
-- This table was planned but missing from the original 0082 migration.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_tab_items (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tab_id TEXT NOT NULL REFERENCES fnb_tabs(id),
  catalog_item_id TEXT NOT NULL,
  catalog_item_name TEXT NOT NULL,
  seat_number INTEGER NOT NULL DEFAULT 1,
  course_number INTEGER NOT NULL DEFAULT 1,
  quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  extended_price_cents INTEGER NOT NULL,
  modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','fired','served','voided')),
  sent_at TIMESTAMPTZ,
  fired_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Indexes
CREATE INDEX idx_fnb_tab_items_tab_course ON fnb_tab_items(tab_id, course_number);
CREATE INDEX idx_fnb_tab_items_tab_seat ON fnb_tab_items(tab_id, seat_number);
CREATE INDEX idx_fnb_tab_items_tenant_tab ON fnb_tab_items(tenant_id, tab_id);
CREATE INDEX idx_fnb_tab_items_status ON fnb_tab_items(tab_id, status);

-- RLS
ALTER TABLE fnb_tab_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_tab_items FORCE ROW LEVEL SECURITY;

CREATE POLICY fnb_tab_items_select ON fnb_tab_items
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY fnb_tab_items_insert ON fnb_tab_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY fnb_tab_items_update ON fnb_tab_items
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY fnb_tab_items_delete ON fnb_tab_items
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
