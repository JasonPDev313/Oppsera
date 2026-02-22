-- UXOPS-01: Drawer Sessions + Server-Persisted Shifts
-- Promotes shift management from localStorage to server-persisted drawer sessions
-- with append-only cash management event log.

-- ── Drawer Sessions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drawer_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  terminal_id TEXT NOT NULL REFERENCES terminals(id),
  profit_center_id TEXT,
  employee_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  closing_count_cents INTEGER,
  expected_cash_cents INTEGER,
  variance_cents INTEGER,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one open session per terminal per business date
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawer_sessions_tenant_terminal_date
  ON drawer_sessions(tenant_id, terminal_id, business_date);

CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_status
  ON drawer_sessions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_location
  ON drawer_sessions(tenant_id, location_id);

CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_terminal
  ON drawer_sessions(tenant_id, terminal_id);

CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_date
  ON drawer_sessions(tenant_id, business_date);

-- RLS
ALTER TABLE drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawer_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY drawer_sessions_select ON drawer_sessions
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY drawer_sessions_insert ON drawer_sessions
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY drawer_sessions_update ON drawer_sessions
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));


-- ── Drawer Session Events (append-only) ─────────────────────────

CREATE TABLE IF NOT EXISTS drawer_session_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  drawer_session_id TEXT NOT NULL REFERENCES drawer_sessions(id),
  event_type TEXT NOT NULL,  -- 'paid_in' | 'paid_out' | 'cash_drop' | 'drawer_open' | 'no_sale'
  amount_cents INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  employee_id TEXT NOT NULL,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawer_session_events_tenant_session
  ON drawer_session_events(tenant_id, drawer_session_id);

CREATE INDEX IF NOT EXISTS idx_drawer_session_events_tenant_type
  ON drawer_session_events(tenant_id, event_type);

-- RLS (append-only: SELECT + INSERT only)
ALTER TABLE drawer_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawer_session_events FORCE ROW LEVEL SECURITY;

CREATE POLICY drawer_session_events_select ON drawer_session_events
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY drawer_session_events_insert ON drawer_session_events
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
