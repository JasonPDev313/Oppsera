-- Migration: 0161_pms_yield_management
-- PMS Yield / Revenue Management — pricing rules + pricing log

-- ── Table 1: pms_pricing_rules ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_pricing_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('occupancy_threshold', 'day_of_week', 'lead_time', 'seasonal', 'event')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  conditions_json JSONB NOT NULL DEFAULT '{}',
  adjustments_json JSONB NOT NULL DEFAULT '{}',
  floor_cents INTEGER,
  ceiling_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pms_pricing_rules_tenant_property ON pms_pricing_rules(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_pms_pricing_rules_active ON pms_pricing_rules(tenant_id, property_id, is_active) WHERE is_active = true;

-- ── Table 2: pms_pricing_log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_pricing_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  room_type_id TEXT NOT NULL REFERENCES pms_room_types(id),
  business_date DATE NOT NULL,
  base_rate_cents INTEGER NOT NULL,
  adjusted_rate_cents INTEGER NOT NULL,
  rules_applied_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_pricing_log ON pms_pricing_log(tenant_id, property_id, room_type_id, business_date);

-- ── RLS: pms_pricing_rules (full CRUD) ──────────────────────────
ALTER TABLE pms_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_pricing_rules FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_rules_tenant_select') THEN
    CREATE POLICY pms_pricing_rules_tenant_select ON pms_pricing_rules FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_rules_tenant_insert') THEN
    CREATE POLICY pms_pricing_rules_tenant_insert ON pms_pricing_rules FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_rules_tenant_update') THEN
    CREATE POLICY pms_pricing_rules_tenant_update ON pms_pricing_rules FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_rules_tenant_delete') THEN
    CREATE POLICY pms_pricing_rules_tenant_delete ON pms_pricing_rules FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── RLS: pms_pricing_log (append-only: SELECT + INSERT) ─────────
ALTER TABLE pms_pricing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_pricing_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_log_tenant_select') THEN
    CREATE POLICY pms_pricing_log_tenant_select ON pms_pricing_log FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_pricing_log_tenant_insert') THEN
    CREATE POLICY pms_pricing_log_tenant_insert ON pms_pricing_log FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
