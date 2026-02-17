-- RLS policies for catalog tables
-- Junction table catalog_item_modifier_groups does NOT get RLS
-- (access controlled through parent tables)

-- tax_categories
ALTER TABLE tax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON tax_categories
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON tax_categories
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON tax_categories
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON tax_categories
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_categories
ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_categories
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_categories
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_categories
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_categories
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_items
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_items
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_items
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_items
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_modifier_groups
ALTER TABLE catalog_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_modifier_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_modifier_groups
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_modifier_groups
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_modifier_groups
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_modifier_groups
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_modifiers
ALTER TABLE catalog_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_modifiers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_modifiers
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_modifiers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_modifiers
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_modifiers
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- catalog_location_prices
ALTER TABLE catalog_location_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_location_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON catalog_location_prices
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON catalog_location_prices
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON catalog_location_prices
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON catalog_location_prices
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
