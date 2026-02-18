-- Migration: 0047_legacy_id_mapping
-- Infrastructure table for the legacy data migration pipeline.
-- Maps legacy MSSQL bigint IDs to new Postgres ULID text IDs.
-- Used by the ETL pipeline to resolve foreign key references across domains.
-- This table is NOT tenant-scoped (no RLS) — it's an admin-only migration artifact.

-- ── legacy_id_map ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legacy_id_map (
  legacy_table   TEXT NOT NULL,
  legacy_id      TEXT NOT NULL,
  new_table      TEXT NOT NULL,
  new_id         TEXT NOT NULL,
  tenant_id      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (legacy_table, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_id_map_new
  ON legacy_id_map (new_table, new_id);

CREATE INDEX IF NOT EXISTS idx_legacy_id_map_tenant
  ON legacy_id_map (tenant_id, legacy_table);

CREATE INDEX IF NOT EXISTS idx_legacy_id_map_lookup
  ON legacy_id_map (legacy_table, legacy_id, new_id);

-- ── migration_cutover_state ────────────────────────────────────
-- Tracks per-tenant cutover progress through the gradual migration.
CREATE TABLE IF NOT EXISTS migration_cutover_state (
  tenant_id    TEXT PRIMARY KEY REFERENCES tenants(id),
  phase        TEXT NOT NULL DEFAULT 'not_started',
  state_json   JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── migration_monitor_log ──────────────────────────────────────
-- Records daily post-migration monitoring check results.
CREATE TABLE IF NOT EXISTS migration_monitor_log (
  id             SERIAL PRIMARY KEY,
  check_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  tenant_id      TEXT,
  passed_count   INTEGER NOT NULL DEFAULT 0,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_monitor_log_date
  ON migration_monitor_log (check_date, tenant_id);
