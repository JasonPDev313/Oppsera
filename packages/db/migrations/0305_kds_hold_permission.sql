-- Grant kds.hold and pos_fnb.kds.hold to every role that already has kds.bump
-- This makes hold/unhold available to the same users who can bump tickets on KDS.

-- ── Tenant roles (role_permissions) ──────────────────────────────
INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), rp.role_id, 'kds.hold'
FROM role_permissions rp
WHERE rp.permission = 'kds.bump'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), rp.role_id, 'pos_fnb.kds.hold'
FROM role_permissions rp
WHERE rp.permission = 'pos_fnb.kds.bump'
ON CONFLICT (role_id, permission) DO NOTHING;

-- ── Business type role templates (business_type_role_permissions) ─
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), bp.role_template_id, 'kds.hold'
FROM business_type_role_permissions bp
WHERE bp.permission_key = 'kds.bump'
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), bp.role_template_id, 'pos_fnb.kds.hold'
FROM business_type_role_permissions bp
WHERE bp.permission_key = 'pos_fnb.kds.bump'
ON CONFLICT (role_template_id, permission_key) DO NOTHING;
