-- Migration: 0074_ap_landed_cost.sql
-- Session 31: Landed cost allocations for AP bills

CREATE TABLE IF NOT EXISTS ap_bill_landed_cost_allocations (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES ap_bills(id),
  freight_line_id TEXT NOT NULL REFERENCES ap_bill_lines(id),
  inventory_line_id TEXT NOT NULL REFERENCES ap_bill_lines(id),
  allocated_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_bill_lca_bill ON ap_bill_landed_cost_allocations(bill_id);

-- RLS
ALTER TABLE ap_bill_landed_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_bill_landed_cost_allocations FORCE ROW LEVEL SECURITY;

-- For LCA we need bill-based tenant check (join to ap_bills for tenant_id)
CREATE POLICY ap_bill_lca_select ON ap_bill_landed_cost_allocations
  FOR SELECT USING (
    bill_id IN (SELECT id FROM ap_bills WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ap_bill_lca_insert ON ap_bill_landed_cost_allocations
  FOR INSERT WITH CHECK (
    bill_id IN (SELECT id FROM ap_bills WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ap_bill_lca_update ON ap_bill_landed_cost_allocations
  FOR UPDATE USING (
    bill_id IN (SELECT id FROM ap_bills WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ap_bill_lca_delete ON ap_bill_landed_cost_allocations
  FOR DELETE USING (
    bill_id IN (SELECT id FROM ap_bills WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );
