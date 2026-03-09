-- KDS Send Tracking: delivery lifecycle per ticket per station
CREATE TABLE IF NOT EXISTS fnb_kds_send_tracking (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT NOT NULL,
  order_id        TEXT,
  ticket_id       TEXT NOT NULL,
  ticket_number   INTEGER NOT NULL,
  course_id       TEXT,
  course_number   INTEGER,
  station_id      TEXT NOT NULL,
  station_name    TEXT NOT NULL,
  terminal_id     TEXT,
  terminal_name   TEXT,
  employee_id     TEXT,
  employee_name   TEXT,
  send_token      TEXT NOT NULL,
  prior_send_token TEXT,
  send_type       TEXT NOT NULL DEFAULT 'initial',
  routing_reason  TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  kds_operational_status TEXT,
  error_code      TEXT,
  error_detail    TEXT,
  item_count      INTEGER NOT NULL DEFAULT 0,
  order_type      TEXT,
  table_name      TEXT,
  guest_name      TEXT,
  queued_at       TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  displayed_at    TIMESTAMPTZ,
  first_interaction_at TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  deleted_by_employee_id TEXT,
  delete_reason   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_retry_at   TIMESTAMPTZ,
  needs_attention BOOLEAN NOT NULL DEFAULT false,
  stuck_reason    TEXT,
  business_date   DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_send_token
  ON fnb_kds_send_tracking (tenant_id, send_token);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_tracking_tenant_location
  ON fnb_kds_send_tracking (tenant_id, location_id, business_date);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_tracking_ticket
  ON fnb_kds_send_tracking (ticket_id);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_tracking_station
  ON fnb_kds_send_tracking (station_id, status);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_tracking_status
  ON fnb_kds_send_tracking (tenant_id, location_id, status);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_tracking_attention
  ON fnb_kds_send_tracking (tenant_id, location_id, needs_attention)
  WHERE needs_attention = true;

-- RLS
ALTER TABLE fnb_kds_send_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_send_tracking_tenant_isolation ON fnb_kds_send_tracking;
CREATE POLICY fnb_kds_send_tracking_tenant_isolation ON fnb_kds_send_tracking
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- KDS Send Events: append-only timeline per send
CREATE TABLE IF NOT EXISTS fnb_kds_send_events (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  location_id      TEXT NOT NULL,
  send_tracking_id TEXT NOT NULL,
  send_token       TEXT NOT NULL,
  ticket_id        TEXT NOT NULL,
  station_id       TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  event_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type       TEXT NOT NULL DEFAULT 'system',
  actor_id         TEXT,
  actor_name       TEXT,
  previous_status  TEXT,
  new_status       TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_events_tracking
  ON fnb_kds_send_events (send_tracking_id);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_events_token
  ON fnb_kds_send_events (tenant_id, send_token);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_send_events_ticket
  ON fnb_kds_send_events (ticket_id);

-- RLS
ALTER TABLE fnb_kds_send_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fnb_kds_send_events_tenant_isolation ON fnb_kds_send_events;
CREATE POLICY fnb_kds_send_events_tenant_isolation ON fnb_kds_send_events
  USING (tenant_id = current_setting('app.current_tenant_id', true));
