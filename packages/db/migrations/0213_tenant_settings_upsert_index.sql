-- Migration 0213: Ensure tenant_settings unique index exists for ON CONFLICT upserts
-- The unique index was defined in 0001_core_schema.sql but may be missing from DBs
-- where migrations were run before the index was added or where schema drift occurred.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_settings_scoped"
  ON "tenant_settings" ("tenant_id", "module_key", "setting_key", COALESCE("location_id", '__global__'));
