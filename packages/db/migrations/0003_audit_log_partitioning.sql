-- Migration: Convert audit_log to partitioned table (monthly partitions)

-- Step 1: Save any existing data
CREATE TABLE IF NOT EXISTS audit_log_backup AS SELECT * FROM audit_log;

-- Step 2: Drop the existing table and its indexes
DROP TABLE IF EXISTS audit_log CASCADE;

-- Step 3: Recreate as a partitioned table
CREATE TABLE audit_log (
  id              TEXT NOT NULL DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL,
  location_id     TEXT,
  actor_user_id   TEXT,
  actor_type      TEXT NOT NULL DEFAULT 'user'
                    CHECK (actor_type IN ('user','system','api_key')),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  changes         JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 4: Create indexes (on the parent — they propagate to partitions)
CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(tenant_id, actor_user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(tenant_id, action, created_at DESC);

-- Step 5: Create partitions for current and next 5 months
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Step 6: Re-enable RLS on the partitioned table
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON audit_log
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON audit_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- No UPDATE or DELETE policies — audit log is append-only

-- Step 7: Restore any backup data
INSERT INTO audit_log SELECT * FROM audit_log_backup;
DROP TABLE IF EXISTS audit_log_backup;
