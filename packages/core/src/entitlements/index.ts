export interface EntitlementCheck {
  isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean>;
  getModuleLimits(tenantId: string, moduleKey: string): Promise<Record<string, number> | null>;
  getEnabledModules(tenantId: string): Promise<string[]>;
}

export { DefaultEntitlementEngine, getEntitlementEngine, setEntitlementEngine } from './engine';
export { requireEntitlement } from './middleware';
export type { EntitlementCache, EntitlementCacheEntry } from './cache';
export { InMemoryEntitlementCache, getEntitlementCache, setEntitlementCache } from './cache';
export { MODULE_REGISTRY } from './registry';
export type { ModuleKey } from './registry';
export { checkSeatLimit, checkLocationLimit } from './limits';
