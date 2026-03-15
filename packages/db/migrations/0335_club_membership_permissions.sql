-- Additive-only: seed club_membership permissions for all existing tenants.
-- Uses ON CONFLICT DO NOTHING so it's safe to re-run.

-- Manager: full wildcard
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'club_membership.*'
FROM roles r WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;

-- Supervisor: view + reports
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, perm
FROM roles r, unnest(ARRAY['club_membership.view', 'club_membership.reports']) AS perm
WHERE r.name = 'supervisor'
ON CONFLICT DO NOTHING;

-- Staff: view only
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'club_membership.view'
FROM roles r WHERE r.name = 'staff'
ON CONFLICT DO NOTHING;

-- Viewer: view only
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'club_membership.view'
FROM roles r WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;
