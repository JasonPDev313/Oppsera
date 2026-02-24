-- 0167: PMS Guest Self-Service Portal
-- Phase E1: Guest portal sessions for self-service check-in

CREATE TABLE IF NOT EXISTS pms_guest_portal_sessions (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  pre_checkin_completed BOOLEAN NOT NULL DEFAULT false,
  room_preference_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pms_guest_portal_sessions_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pms_guest_portal_sessions_token ON pms_guest_portal_sessions (token);
CREATE INDEX IF NOT EXISTS idx_pms_guest_portal_sessions_tenant ON pms_guest_portal_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pms_guest_portal_sessions_reservation ON pms_guest_portal_sessions (tenant_id, reservation_id);

ALTER TABLE pms_guest_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_guest_portal_sessions FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_guest_portal_sessions_tenant_isolation' AND tablename = 'pms_guest_portal_sessions') THEN
    CREATE POLICY pms_guest_portal_sessions_tenant_isolation ON pms_guest_portal_sessions
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_guest_portal_sessions_tenant_insert' AND tablename = 'pms_guest_portal_sessions') THEN
    CREATE POLICY pms_guest_portal_sessions_tenant_insert ON pms_guest_portal_sessions
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pms_guest_portal_sessions_tenant_update' AND tablename = 'pms_guest_portal_sessions') THEN
    CREATE POLICY pms_guest_portal_sessions_tenant_update ON pms_guest_portal_sessions
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
