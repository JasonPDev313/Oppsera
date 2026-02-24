-- Migration: 0150_pms_communications
-- PMS Email/SMS Message Templates + Guest Communication Log (Phase B1)

-- ── PMS Message Templates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_message_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_pms_msg_tpl_template_key CHECK (template_key IN ('booking_confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'check_in', 'check_out')),
  CONSTRAINT chk_pms_msg_tpl_channel CHECK (channel IN ('email', 'sms')),
  CONSTRAINT uq_pms_message_templates_key UNIQUE (tenant_id, property_id, template_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_pms_message_templates_tenant_property
  ON pms_message_templates (tenant_id, property_id);

-- RLS for pms_message_templates
ALTER TABLE pms_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_message_templates FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_templates_select') THEN
    CREATE POLICY pms_message_templates_select ON pms_message_templates FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_templates_insert') THEN
    CREATE POLICY pms_message_templates_insert ON pms_message_templates FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_templates_update') THEN
    CREATE POLICY pms_message_templates_update ON pms_message_templates FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)))
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_templates_delete') THEN
    CREATE POLICY pms_message_templates_delete ON pms_message_templates FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── PMS Message Log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_message_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  reservation_id TEXT,
  guest_id TEXT,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  external_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  CONSTRAINT chk_pms_msg_log_channel CHECK (channel IN ('email', 'sms', 'phone', 'internal')),
  CONSTRAINT chk_pms_msg_log_direction CHECK (direction IN ('outbound', 'inbound')),
  CONSTRAINT chk_pms_msg_log_message_type CHECK (message_type IN ('confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'request', 'complaint', 'note')),
  CONSTRAINT chk_pms_msg_log_status CHECK (status IN ('pending', 'sent', 'delivered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pms_message_log_tenant_property
  ON pms_message_log (tenant_id, property_id);

CREATE INDEX IF NOT EXISTS idx_pms_message_log_tenant_reservation
  ON pms_message_log (tenant_id, reservation_id);

CREATE INDEX IF NOT EXISTS idx_pms_message_log_tenant_guest
  ON pms_message_log (tenant_id, guest_id);

-- RLS for pms_message_log
ALTER TABLE pms_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_message_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_log_select') THEN
    CREATE POLICY pms_message_log_select ON pms_message_log FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_log_insert') THEN
    CREATE POLICY pms_message_log_insert ON pms_message_log FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_log_update') THEN
    CREATE POLICY pms_message_log_update ON pms_message_log FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)))
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_message_log_delete') THEN
    CREATE POLICY pms_message_log_delete ON pms_message_log FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
