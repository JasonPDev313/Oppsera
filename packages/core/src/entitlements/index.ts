import type { AccessMode } from './registry';

export interface EntitlementCheck {
  isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean>;
  getAccessMode(tenantId: string, moduleKey: string): Promise<AccessMode>;
  getModuleLimits(tenantId: string, moduleKey: string): Promise<Record<string, number> | null>;
  getEnabledModules(tenantId: string): Promise<string[]>;
}

export { DefaultEntitlementEngine, getEntitlementEngine, setEntitlementEngine } from './engine';
export { requireEntitlement, requireEntitlementWrite } from './middleware';
export type { EntitlementCache, EntitlementCacheEntry } from './cache';
export { InMemoryEntitlementCache, getEntitlementCache, setEntitlementCache } from './cache';
export { MODULE_REGISTRY, getModuleDefinition, getDependents } from './registry';
export type { ModuleKey, AccessMode, RiskLevel, ModuleCategory, ModuleDefinition } from './registry';
export { validateModeChange, computeDependencyChain } from './dependencies';
export type { DependencyCheckResult } from './dependencies';
export { checkSeatLimit, checkLocationLimit } from './limits';
