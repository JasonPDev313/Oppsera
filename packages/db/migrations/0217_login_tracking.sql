-- Migration 0217: Login tracking tables
-- Dedicated tables for recording user and admin login events with IP geolocation

-- ── Tenant user login records (RLS-protected) ───────────────────

CREATE TABLE IF NOT EXISTS "login_records" (
  "id"              TEXT PRIMARY KEY,
  "tenant_id"       TEXT NOT NULL REFERENCES "tenants"("id"),
  "user_id"         TEXT REFERENCES "users"("id"),
  "email"           TEXT NOT NULL,
  "outcome"         TEXT NOT NULL,
  "ip_address"      TEXT,
  "user_agent"      TEXT,
  "geo_city"        TEXT,
  "geo_region"      TEXT,
  "geo_country"     TEXT,
  "geo_latitude"    NUMERIC(10,7),
  "geo_longitude"   NUMERIC(10,7),
  "terminal_id"     TEXT,
  "terminal_name"   TEXT,
  "failure_reason"  TEXT,
  "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE "login_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "login_records_tenant_select" ON "login_records"
  FOR SELECT USING ("tenant_id" = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY IF NOT EXISTS "login_records_insert_all" ON "login_records"
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS "idx_login_records_tenant_user"
  ON "login_records" ("tenant_id", "user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_login_records_tenant_created"
  ON "login_records" ("tenant_id", "created_at" DESC);

-- ── Platform admin login records (NO RLS) ───────────────────────

CREATE TABLE IF NOT EXISTS "admin_login_records" (
  "id"              TEXT PRIMARY KEY,
  "admin_id"        TEXT REFERENCES "platform_admins"("id"),
  "email"           TEXT NOT NULL,
  "outcome"         TEXT NOT NULL,
  "ip_address"      TEXT,
  "user_agent"      TEXT,
  "geo_city"        TEXT,
  "geo_region"      TEXT,
  "geo_country"     TEXT,
  "geo_latitude"    NUMERIC(10,7),
  "geo_longitude"   NUMERIC(10,7),
  "failure_reason"  TEXT,
  "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_admin_login_records_admin_created"
  ON "admin_login_records" ("admin_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_admin_login_records_email_created"
  ON "admin_login_records" ("email", "created_at" DESC);
