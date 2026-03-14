-- 0319: Grant ai_support permissions to existing system roles
-- Owner/admin already have '*' which covers everything.
-- Manager gets view + chat + admin; all other front-line roles get view + chat.

-- Manager: ai_support.view, ai_support.chat, ai_support.admin
INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), r.id, p.perm
FROM roles r
CROSS JOIN (VALUES ('ai_support.view'), ('ai_support.chat'), ('ai_support.admin')) AS p(perm)
WHERE r.name = 'manager' AND r.is_system = true
ON CONFLICT (role_id, permission) DO NOTHING;

-- Cashier, Supervisor, Server, Staff: ai_support.view, ai_support.chat
INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), r.id, p.perm
FROM roles r
CROSS JOIN (VALUES ('ai_support.view'), ('ai_support.chat')) AS p(perm)
WHERE r.name IN ('cashier', 'supervisor', 'server', 'staff') AND r.is_system = true
ON CONFLICT (role_id, permission) DO NOTHING;

-- Viewer: ai_support.view only
INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), r.id, 'ai_support.view'
FROM roles r
WHERE r.name = 'viewer' AND r.is_system = true
ON CONFLICT (role_id, permission) DO NOTHING;
