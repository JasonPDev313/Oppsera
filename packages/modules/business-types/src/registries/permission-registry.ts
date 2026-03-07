import { MODULE_REGISTRY } from '@oppsera/core';

// Build permission keys from the module registry.
// Each module supports: module.*, module.read, module.write, module.manage, module.delete
const PERMISSION_SUFFIXES = ['*', 'read', 'write', 'manage', 'delete'] as const;

const keys = new Set<string>();

// Global wildcard
keys.add('*');

// Per-module permissions
for (const mod of MODULE_REGISTRY) {
  for (const suffix of PERMISSION_SUFFIXES) {
    keys.add(`${mod.key}.${suffix}`);
  }
}

// Admin-level permissions
keys.add('admin.*');
keys.add('admin.business_types.manage');
keys.add('admin.business_types.view');
keys.add('admin.provisioning.manage');
keys.add('admin.provisioning.view');
keys.add('admin.tenants.manage');
keys.add('admin.tenants.view');
keys.add('admin.users.manage');
keys.add('admin.users.view');
keys.add('admin.settings.manage');

export const VALID_PERMISSION_KEYS: ReadonlySet<string> = keys;

export function isValidPermissionKey(key: string): boolean {
  // Exact match or wildcard pattern match
  if (VALID_PERMISSION_KEYS.has(key)) return true;
  // Allow module.* style permissions where the module exists
  if (key.endsWith('.*')) {
    const moduleKey = key.slice(0, -2);
    return MODULE_REGISTRY.some((m) => m.key === moduleKey) || moduleKey === 'admin';
  }
  return false;
}
