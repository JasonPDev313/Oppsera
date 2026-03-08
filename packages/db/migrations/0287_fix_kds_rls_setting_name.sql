-- Migration 0287: Fix KDS RLS policies using wrong setting name
-- Migration 0280 created policies referencing 'app.tenant_id' but
-- withTenant() sets 'app.current_tenant_id'. Drop and recreate.

DROP POLICY IF EXISTS tenant_isolation ON fnb_kitchen_actions;
CREATE POLICY tenant_isolation ON fnb_kitchen_actions
  USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fnb_kds_terminal_heartbeats;
CREATE POLICY tenant_isolation ON fnb_kds_terminal_heartbeats
  USING (tenant_id = current_setting('app.current_tenant_id', true));
