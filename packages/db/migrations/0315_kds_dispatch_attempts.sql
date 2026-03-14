-- 0315: KDS Dispatch Attempts
-- Tracks every F&B course dispatch attempt regardless of ticket creation success.
-- Unlike fnb_kds_send_tracking (which requires ticket_id), this table records
-- attempts that fail before any ticket is created, answering "where did my order go?"

CREATE TABLE IF NOT EXISTS fnb_kds_dispatch_attempts (
  id                      TEXT NOT NULL DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL,
  location_id             TEXT NOT NULL,
  tab_id                  TEXT NOT NULL,
  order_id                TEXT,
  course_number           INTEGER NOT NULL,
  effective_kds_location_id TEXT,
  order_type              TEXT,
  channel                 TEXT,
  source                  TEXT NOT NULL DEFAULT 'fnb_course_send',
  status                  TEXT NOT NULL DEFAULT 'started',
  failure_stage           TEXT,
  ticket_count            INTEGER NOT NULL DEFAULT 0,
  tickets_created         JSONB NOT NULL DEFAULT '[]'::jsonb,
  stations_resolved       JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_routed            INTEGER NOT NULL DEFAULT 0,
  items_unrouted          INTEGER NOT NULL DEFAULT 0,
  item_count              INTEGER NOT NULL DEFAULT 0,
  diagnosis               JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  prior_attempt_id        TEXT,
  business_date           TEXT,
  duration_ms             INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fnb_kds_dispatch_attempts_pkey PRIMARY KEY (id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_fnb_kds_dispatch_attempts_tenant
  ON fnb_kds_dispatch_attempts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_dispatch_attempts_tab_course
  ON fnb_kds_dispatch_attempts (tenant_id, tab_id, course_number);

CREATE INDEX IF NOT EXISTS idx_fnb_kds_dispatch_attempts_status
  ON fnb_kds_dispatch_attempts (tenant_id, status)
  WHERE status IN ('failed', 'partial');

CREATE INDEX IF NOT EXISTS idx_fnb_kds_dispatch_attempts_location_date
  ON fnb_kds_dispatch_attempts (tenant_id, location_id, business_date);

-- RLS
ALTER TABLE fnb_kds_dispatch_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fnb_kds_dispatch_attempts'
      AND policyname = 'fnb_kds_dispatch_attempts_tenant_isolation'
  ) THEN
    CREATE POLICY fnb_kds_dispatch_attempts_tenant_isolation
      ON fnb_kds_dispatch_attempts
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
