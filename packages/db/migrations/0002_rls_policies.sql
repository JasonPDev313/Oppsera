-- ── Create application role (non-superuser, so RLS is enforced) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oppsera_app') THEN
    CREATE ROLE oppsera_app WITH LOGIN PASSWORD 'oppsera_dev';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO oppsera_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oppsera_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO oppsera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO oppsera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO oppsera_app;

-- ── Enable RLS on all tenant-scoped tables ───────────────────────

-- tenants
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "tenants"
  FOR SELECT USING (id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "tenants"
  FOR INSERT WITH CHECK (id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "tenants"
  FOR UPDATE USING (id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "tenants"
  FOR DELETE USING (id = current_setting('app.current_tenant_id', true));

-- locations
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "locations"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "locations"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "locations"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "locations"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- memberships
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "memberships"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "memberships"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "memberships"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "memberships"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- roles
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "roles"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "roles"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "roles"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "roles"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- role_permissions
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "role_permissions"
  FOR SELECT USING (
    role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );
CREATE POLICY tenant_isolation_insert ON "role_permissions"
  FOR INSERT WITH CHECK (
    role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );
CREATE POLICY tenant_isolation_update ON "role_permissions"
  FOR UPDATE USING (
    role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );
CREATE POLICY tenant_isolation_delete ON "role_permissions"
  FOR DELETE USING (
    role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_setting('app.current_tenant_id', true))
  );

-- role_assignments
ALTER TABLE "role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "role_assignments"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "role_assignments"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "role_assignments"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "role_assignments"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- entitlements
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entitlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "entitlements"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "entitlements"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "entitlements"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "entitlements"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- audit_log
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "audit_log"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "audit_log"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "audit_log"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "audit_log"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- event_outbox
ALTER TABLE "event_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_outbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "event_outbox"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "event_outbox"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "event_outbox"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "event_outbox"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tenant_settings
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON "tenant_settings"
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "tenant_settings"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON "tenant_settings"
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON "tenant_settings"
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true));
