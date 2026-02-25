/**
 * Workflow Registry — maps entitlement/permission strings to module keys
 * and human-readable workflow names using PERMISSION_MATRIX.
 */
import { PERMISSION_MATRIX, PERMISSION_BY_KEY } from '@oppsera/shared';
import { MODULE_REGISTRY } from '../entitlements/registry';

// ── Entitlement → Module Key mapping ─────────────────────────
// Entitlement keys that differ from the MODULE_REGISTRY key:
const ENTITLEMENT_TO_MODULE: Record<string, string> = {
  orders: 'pos_retail',
  pos_retail: 'pos_retail',
  pos_fnb: 'pos_fnb',
  catalog: 'catalog',
  payments: 'payments',
  inventory: 'inventory',
  customers: 'customers',
  reporting: 'reporting',
  room_layouts: 'room_layouts',
  accounting: 'accounting',
  ap: 'ap',
  ar: 'ar',
  pms: 'pms',
  semantic: 'semantic',
  golf_ops: 'golf_ops',
  kds: 'kds',
  marketing: 'marketing',
  club_membership: 'club_membership',
  api_access: 'api_access',
  legacy_import: 'legacy_import',
  platform_core: 'platform_core',
};

// ── Permission module → MODULE_REGISTRY key mapping ──────────
// PERMISSION_MATRIX uses short module names; map to registry keys.
const PERM_MODULE_TO_REGISTRY: Record<string, string> = {
  platform: 'platform_core',
  catalog: 'catalog',
  pos: 'pos_retail',
  payments: 'payments',
  inventory: 'inventory',
  customers: 'customers',
  reporting: 'reporting',
  accounting: 'accounting',
  ap: 'ap',
  ar: 'ar',
  room_layouts: 'room_layouts',
  semantic: 'semantic',
  pos_fnb: 'pos_fnb',
  golf: 'golf_ops',
  pms: 'pms',
};

export interface WorkflowInfo {
  name: string;
  module: string;
  moduleKey: string;
  description: string;
}

/**
 * Resolve a middleware's entitlement/permission options into a module key.
 *
 * Priority: entitlement → permission module → first segment of permission → 'unknown'
 */
export function resolveModuleKey(entitlement?: string, permission?: string): string {
  // 1. Direct entitlement mapping
  if (entitlement && ENTITLEMENT_TO_MODULE[entitlement]) {
    return ENTITLEMENT_TO_MODULE[entitlement];
  }

  // 2. Permission key lookup → module
  if (permission) {
    const def = PERMISSION_BY_KEY.get(permission);
    if (def) {
      return PERM_MODULE_TO_REGISTRY[def.module] || def.module;
    }
    // 3. Fall back to first segment of permission string
    const firstSegment = permission.split('.')[0] || 'unknown';
    return PERM_MODULE_TO_REGISTRY[firstSegment] || ENTITLEMENT_TO_MODULE[firstSegment] || firstSegment;
  }

  return 'unknown';
}

/**
 * Get human-readable workflow info for a permission key.
 */
export function getWorkflowInfo(permissionKey: string): WorkflowInfo | null {
  const def = PERMISSION_BY_KEY.get(permissionKey);
  if (!def) return null;

  const moduleKey = PERM_MODULE_TO_REGISTRY[def.module] || def.module;
  const moduleDef = MODULE_REGISTRY.find((m) => m.key === moduleKey);

  return {
    name: def.description,
    module: moduleDef?.name || def.module,
    moduleKey,
    description: def.description,
  };
}

/**
 * Get all workflows (permissions) for a given module key.
 */
export function getWorkflowsForModule(moduleKey: string): WorkflowInfo[] {
  // Reverse-map registry key to permission matrix module names
  const permModules = Object.entries(PERM_MODULE_TO_REGISTRY)
    .filter(([, regKey]) => regKey === moduleKey)
    .map(([permMod]) => permMod);

  if (permModules.length === 0) permModules.push(moduleKey);

  return PERMISSION_MATRIX.filter((p) => permModules.includes(p.module)).map((p) => ({
    name: p.description,
    module: p.module,
    moduleKey,
    description: p.description,
  }));
}
