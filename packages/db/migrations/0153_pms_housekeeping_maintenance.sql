-- Migration 0153: PMS Housekeeping Assignments + Maintenance Work Orders
-- Adds: pms_housekeepers, pms_housekeeping_assignments, pms_work_orders, pms_work_order_comments
-- Alters: pms_rooms (adds last_cleaned_at, last_cleaned_by)

-- ── 1. PMS Housekeepers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_housekeepers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_housekeepers_tenant_property
  ON pms_housekeepers (tenant_id, property_id);

ALTER TABLE pms_housekeepers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_housekeepers FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeepers' AND policyname = 'pms_housekeepers_select'
  ) THEN
    CREATE POLICY pms_housekeepers_select ON pms_housekeepers
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeepers' AND policyname = 'pms_housekeepers_insert'
  ) THEN
    CREATE POLICY pms_housekeepers_insert ON pms_housekeepers
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeepers' AND policyname = 'pms_housekeepers_update'
  ) THEN
    CREATE POLICY pms_housekeepers_update ON pms_housekeepers
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeepers' AND policyname = 'pms_housekeepers_delete'
  ) THEN
    CREATE POLICY pms_housekeepers_delete ON pms_housekeepers
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── 2. PMS Housekeeping Assignments ──────────────────────────────
CREATE TABLE IF NOT EXISTS pms_housekeeping_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  housekeeper_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_hk_assignment_room_date
  ON pms_housekeeping_assignments (tenant_id, room_id, business_date);

CREATE INDEX IF NOT EXISTS idx_pms_hk_assignments_property_date
  ON pms_housekeeping_assignments (tenant_id, property_id, business_date);

CREATE INDEX IF NOT EXISTS idx_pms_hk_assignments_housekeeper_date
  ON pms_housekeeping_assignments (tenant_id, housekeeper_id, business_date);

ALTER TABLE pms_housekeeping_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_housekeeping_assignments FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeeping_assignments' AND policyname = 'pms_housekeeping_assignments_select'
  ) THEN
    CREATE POLICY pms_housekeeping_assignments_select ON pms_housekeeping_assignments
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeeping_assignments' AND policyname = 'pms_housekeeping_assignments_insert'
  ) THEN
    CREATE POLICY pms_housekeeping_assignments_insert ON pms_housekeeping_assignments
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeeping_assignments' AND policyname = 'pms_housekeeping_assignments_update'
  ) THEN
    CREATE POLICY pms_housekeeping_assignments_update ON pms_housekeeping_assignments
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_housekeeping_assignments' AND policyname = 'pms_housekeeping_assignments_delete'
  ) THEN
    CREATE POLICY pms_housekeeping_assignments_delete ON pms_housekeeping_assignments
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── 3. PMS Work Orders ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_work_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL,
  room_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  reported_by TEXT NOT NULL,
  estimated_hours NUMERIC(5,1),
  actual_hours NUMERIC(5,1),
  parts_cost_cents INTEGER,
  completed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_work_orders_tenant_property
  ON pms_work_orders (tenant_id, property_id);

CREATE INDEX IF NOT EXISTS idx_pms_work_orders_status
  ON pms_work_orders (tenant_id, property_id, status);

ALTER TABLE pms_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_work_orders FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_orders' AND policyname = 'pms_work_orders_select'
  ) THEN
    CREATE POLICY pms_work_orders_select ON pms_work_orders
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_orders' AND policyname = 'pms_work_orders_insert'
  ) THEN
    CREATE POLICY pms_work_orders_insert ON pms_work_orders
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_orders' AND policyname = 'pms_work_orders_update'
  ) THEN
    CREATE POLICY pms_work_orders_update ON pms_work_orders
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_orders' AND policyname = 'pms_work_orders_delete'
  ) THEN
    CREATE POLICY pms_work_orders_delete ON pms_work_orders
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── 4. PMS Work Order Comments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_work_order_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  work_order_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pms_work_order_comments_wo
  ON pms_work_order_comments (tenant_id, work_order_id);

ALTER TABLE pms_work_order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_work_order_comments FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_order_comments' AND policyname = 'pms_work_order_comments_select'
  ) THEN
    CREATE POLICY pms_work_order_comments_select ON pms_work_order_comments
      FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_order_comments' AND policyname = 'pms_work_order_comments_insert'
  ) THEN
    CREATE POLICY pms_work_order_comments_insert ON pms_work_order_comments
      FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_order_comments' AND policyname = 'pms_work_order_comments_update'
  ) THEN
    CREATE POLICY pms_work_order_comments_update ON pms_work_order_comments
      FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pms_work_order_comments' AND policyname = 'pms_work_order_comments_delete'
  ) THEN
    CREATE POLICY pms_work_order_comments_delete ON pms_work_order_comments
      FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── 5. Add housekeeping columns to pms_rooms ─────────────────────
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS last_cleaned_at TIMESTAMPTZ;
ALTER TABLE pms_rooms ADD COLUMN IF NOT EXISTS last_cleaned_by TEXT;
