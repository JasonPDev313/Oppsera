-- 0323: AI Support hardening — custom role permissions + entitlement provisioning
--
-- 1. Grant ai_support.view + ai_support.chat to ALL custom (non-system) roles
--    that don't already have them. System roles were covered by 0319.
--
-- 2. Provision the 'ai_support' entitlement for every tenant that doesn't
--    already have it, so the entitlement gate doesn't block existing tenants.

-- Custom roles: ai_support.view + ai_support.chat
INSERT INTO role_permissions (id, role_id, permission)
SELECT gen_ulid(), r.id, p.perm
FROM roles r
CROSS JOIN (VALUES ('ai_support.view'), ('ai_support.chat')) AS p(perm)
WHERE r.is_system = false
ON CONFLICT (role_id, permission) DO NOTHING;

-- Entitlement: enable ai_support for all tenants
INSERT INTO entitlements (id, tenant_id, module_key, plan_tier, is_enabled, access_mode)
SELECT gen_ulid(), t.id, 'ai_support', 'standard', true, 'full'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM entitlements e
  WHERE e.tenant_id = t.id AND e.module_key = 'ai_support'
)
ON CONFLICT DO NOTHING;
