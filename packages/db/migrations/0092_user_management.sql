-- User management expansion: tenant-scoped identity, secure PIN storage, invites.

-- Drop global email unique constraint so email can be unique per tenant instead.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(att.attname ORDER BY att.attnum)
      FROM unnest(c.conkey) AS cols(attnum)
      JOIN pg_attribute att
        ON att.attrelid = t.oid
       AND att.attnum = cols.attnum
    ) = ARRAY['email']::name[];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id text REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_role_id text REFERENCES roles(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tab_color text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_payroll_employee_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by_user_id text REFERENCES users(id);

-- Best-effort backfill from memberships for existing single-tenant users.
WITH first_membership AS (
  SELECT DISTINCT ON (user_id) user_id, tenant_id
  FROM memberships
  ORDER BY user_id, created_at ASC
)
UPDATE users u
SET tenant_id = fm.tenant_id
FROM first_membership fm
WHERE u.id = fm.user_id
  AND u.tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email
  ON users (tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_username
  ON users (tenant_id, username)
  WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant
  ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_status
  ON users (tenant_id, status);

CREATE TABLE IF NOT EXISTS user_security (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  unique_login_pin_hash text,
  pos_override_pin_hash text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id text PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_user_role
  ON user_roles (user_id, role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user
  ON user_roles (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS user_locations (
  id text PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_locations_user_location
  ON user_locations (user_id, location_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_tenant_user
  ON user_locations (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS user_invites (
  id text PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  invited_by_user_id text REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invites_token_hash
  ON user_invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_invites_tenant_email
  ON user_invites (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_user_invites_user
  ON user_invites (user_id);

ALTER TABLE user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_security FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON user_security FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)
    )
  );
CREATE POLICY tenant_isolation_insert ON user_security FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)
    )
  );
CREATE POLICY tenant_isolation_update ON user_security FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)
    )
  );
CREATE POLICY tenant_isolation_delete ON user_security FOR DELETE
  USING (
    user_id IN (
      SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)
    )
  );

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON user_roles FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON user_roles FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON user_roles FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON user_roles FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON user_locations FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON user_locations FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON user_locations FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON user_locations FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON user_invites FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_insert ON user_invites FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_update ON user_invites FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_delete ON user_invites FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));
