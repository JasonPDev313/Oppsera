-- ── Tenants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'active',
  "billing_customer_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Locations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "locations" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "timezone" text NOT NULL DEFAULT 'America/New_York',
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "country" text NOT NULL DEFAULT 'US',
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_locations_tenant" ON "locations" ("tenant_id");

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "email" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "auth_provider_id" text UNIQUE,
  "is_platform_admin" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Memberships ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "memberships" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_memberships_tenant_user" ON "memberships" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_memberships_tenant" ON "memberships" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_memberships_user" ON "memberships" ("user_id");

-- ── Roles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "roles" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_roles_tenant_name" ON "roles" ("tenant_id", "name");

-- ── Role Permissions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "role_id" text NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_role_permissions_role_perm" ON "role_permissions" ("role_id", "permission");

-- ── Role Assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "role_assignments" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "role_id" text NOT NULL REFERENCES "roles"("id"),
  "location_id" text REFERENCES "locations"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_role_assignments_user" ON "role_assignments" ("tenant_id", "user_id");

-- ── Entitlements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entitlements" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "module_key" text NOT NULL,
  "plan_tier" text NOT NULL DEFAULT 'standard',
  "is_enabled" boolean NOT NULL DEFAULT true,
  "limits" jsonb NOT NULL DEFAULT '{}',
  "activated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_entitlements_tenant_module" ON "entitlements" ("tenant_id", "module_key");
CREATE INDEX IF NOT EXISTS "idx_entitlements_tenant" ON "entitlements" ("tenant_id");

-- ── Audit Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL,
  "location_id" text,
  "actor_user_id" text,
  "actor_type" text NOT NULL DEFAULT 'user',
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "changes" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_audit_tenant_created" ON "audit_log" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_log" ("tenant_id", "entity_type", "entity_id");

-- ── Event Outbox ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_outbox" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL,
  "event_type" text NOT NULL,
  "event_id" text NOT NULL UNIQUE,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_outbox_unpublished" ON "event_outbox" ("published_at") WHERE "published_at" IS NULL;

-- ── Processed Events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "processed_events" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "event_id" text NOT NULL,
  "consumer_name" text NOT NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_processed_events" ON "processed_events" ("event_id", "consumer_name");

-- ── Tenant Settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "id" text PRIMARY KEY DEFAULT gen_ulid(),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "location_id" text REFERENCES "locations"("id"),
  "module_key" text NOT NULL,
  "setting_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_settings_scoped" ON "tenant_settings" ("tenant_id", "module_key", "setting_key", COALESCE("location_id", '__global__'));
CREATE INDEX IF NOT EXISTS "idx_tenant_settings_lookup" ON "tenant_settings" ("tenant_id", "module_key", "setting_key", "location_id");
