-- Migration 0202: Housekeeper management — require user link, add housekeeper role
-- Safe: no production housekeeper data exists (creation UI never shipped)

-- ── Step 1: Clean orphaned rows with NULL user_id ──────────────────
DELETE FROM pms_housekeepers WHERE user_id IS NULL;

-- ── Step 2: Add FK constraint (idempotent via DO block) ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pms_housekeepers_user'
  ) THEN
    ALTER TABLE pms_housekeepers
      ADD CONSTRAINT fk_pms_housekeepers_user
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

-- ── Step 3: Make user_id NOT NULL ──────────────────────────────────
ALTER TABLE pms_housekeepers ALTER COLUMN user_id SET NOT NULL;

-- ── Step 4: Prevent duplicate user-per-property ────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_housekeepers_tenant_property_user
  ON pms_housekeepers (tenant_id, property_id, user_id);

-- ── Step 5: Create housekeeper role for all existing tenants ───────
INSERT INTO roles (id, tenant_id, name, description, is_system, created_at)
SELECT
  'hk_' || t.id,
  t.id,
  'housekeeper',
  'Housekeeping staff with PMS room and cleaning access',
  true,
  now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.name = 'housekeeper'
);

-- ── Step 6: Insert permissions for housekeeper roles ───────────────
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.perm
FROM roles r
CROSS JOIN (VALUES
  ('pms.property.view'),
  ('pms.rooms.view'),
  ('pms.housekeeping.view'),
  ('pms.housekeeping.complete'),
  ('pms.housekeeping.manage'),
  ('pms.housekeepers.manage'),
  ('pos_fnb.floor_plan.view')
) AS p(perm)
WHERE r.name = 'housekeeper' AND r.is_system = true
AND NOT EXISTS (
  SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission = p.perm
);
