-- RLS policies for tax system tables

-- tax_rates
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tax_rates
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tax_rates
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON tax_rates
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tax_rates
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tax_groups
ALTER TABLE tax_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tax_groups
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tax_groups
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON tax_groups
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tax_groups
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tax_group_rates
ALTER TABLE tax_group_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_group_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tax_group_rates
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tax_group_rates
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON tax_group_rates
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tax_group_rates
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_item_location_tax_groups
ALTER TABLE catalog_item_location_tax_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_item_location_tax_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_item_location_tax_groups
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_item_location_tax_groups
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_item_location_tax_groups
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_item_location_tax_groups
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- order_line_taxes (append-only: SELECT + INSERT only)
ALTER TABLE order_line_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_taxes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON order_line_taxes
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON order_line_taxes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
-- No UPDATE or DELETE policies — order_line_taxes is append-only
