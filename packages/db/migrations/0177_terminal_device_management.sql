-- Terminal Device Management: Map physical CardPointe terminals (HSN) to POS terminals
-- Each POS terminal can have one physical payment device assigned

CREATE TABLE IF NOT EXISTS terminal_device_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  terminal_id TEXT NOT NULL REFERENCES terminals(id),
  provider_id TEXT NOT NULL REFERENCES payment_providers(id),
  hsn TEXT NOT NULL,
  device_model TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_devices_tenant ON terminal_device_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_terminal_devices_tenant_hsn ON terminal_device_assignments(tenant_id, hsn);
CREATE INDEX IF NOT EXISTS idx_terminal_devices_tenant_active ON terminal_device_assignments(tenant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_devices_tenant_terminal ON terminal_device_assignments(tenant_id, terminal_id);

-- RLS
ALTER TABLE terminal_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_device_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terminal_devices_tenant_isolation ON terminal_device_assignments;
CREATE POLICY terminal_devices_tenant_isolation ON terminal_device_assignments
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_devices_tenant_insert ON terminal_device_assignments;
CREATE POLICY terminal_devices_tenant_insert ON terminal_device_assignments
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_devices_tenant_update ON terminal_device_assignments;
CREATE POLICY terminal_devices_tenant_update ON terminal_device_assignments
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS terminal_devices_tenant_delete ON terminal_device_assignments;
CREATE POLICY terminal_devices_tenant_delete ON terminal_device_assignments
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
