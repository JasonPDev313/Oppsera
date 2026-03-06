-- Migration 0280: KDS enhancements
-- Adds: kitchen action log, terminal heartbeats, rush mode, richer metrics

-- ── 1. Kitchen Action Log (append-only audit trail) ──────────────────

CREATE TABLE IF NOT EXISTS fnb_kitchen_actions (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  station_id TEXT,
  ticket_id TEXT NOT NULL,
  ticket_item_id TEXT,
  action_type TEXT NOT NULL, -- bump_item, bump_ticket, recall, callback, fire, void, refire
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  reason TEXT,
  metadata JSONB,
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_actions_tenant_date
  ON fnb_kitchen_actions (tenant_id, location_id, business_date);

CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_actions_ticket
  ON fnb_kitchen_actions (ticket_id);

CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_actions_actor
  ON fnb_kitchen_actions (tenant_id, actor_id, created_at DESC);

-- ── 2. KDS Terminal Heartbeats ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS fnb_kds_terminal_heartbeats (
  id TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  location_id TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_kds_heartbeat_terminal
  ON fnb_kds_terminal_heartbeats (tenant_id, location_id, terminal_id);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_heartbeat_station
  ON fnb_kds_terminal_heartbeats (station_id);

-- ── 3. Rush Mode on Stations ─────────────────────────────────────────

ALTER TABLE fnb_kitchen_stations
  ADD COLUMN IF NOT EXISTS rush_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. Richer Metrics on Performance Table ───────────────────────────

ALTER TABLE rm_fnb_kitchen_performance
  ADD COLUMN IF NOT EXISTS avg_fire_to_ready_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS avg_ready_to_served_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS recall_count INTEGER NOT NULL DEFAULT 0;

-- Also add to station metrics snapshot for consistency
ALTER TABLE fnb_station_metrics_snapshot
  ADD COLUMN IF NOT EXISTS avg_fire_to_ready_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS avg_ready_to_served_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS recall_count INTEGER NOT NULL DEFAULT 0;

-- ── 5. RLS Policies ─────────────────────────────────────────────────

ALTER TABLE fnb_kitchen_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fnb_kitchen_actions' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON fnb_kitchen_actions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

ALTER TABLE fnb_kds_terminal_heartbeats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fnb_kds_terminal_heartbeats' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON fnb_kds_terminal_heartbeats
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
