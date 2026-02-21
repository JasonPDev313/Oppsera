import { MODULE_REGISTRY, type AccessMode, type ModuleDefinition } from './registry';

export interface DependencyCheckResult {
  allowed: boolean;
  /** Modules that need to be enabled first */
  missingDependencies: { key: string; name: string; currentMode: AccessMode }[];
  /** Modules that would be affected by disabling this one */
  dependents: { key: string; name: string; currentMode: AccessMode }[];
  /** Whether a reason is required for this change */
  reasonRequired: boolean;
}

/**
 * Validates whether a module mode change is allowed given the current entitlement state.
 *
 * This function is pure — no DB access, no side effects. The caller provides the
 * current entitlement map and the engine returns the validation result.
 *
 * No auto-cascade: if disabling a module would orphan dependents, the engine returns
 * allowed=false. The admin must explicitly disable dependents first or use bulk mode.
 */
export function validateModeChange(
  moduleKey: string,
  targetMode: AccessMode,
  currentEntitlements: Map<string, AccessMode>,
): DependencyCheckResult {
  const moduleDef = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  if (!moduleDef) {
    return {
      allowed: false,
      missingDependencies: [],
      dependents: [],
      reasonRequired: false,
    };
  }

  const result: DependencyCheckResult = {
    allowed: true,
    missingDependencies: [],
    dependents: [],
    reasonRequired: false,
  };

  // platform_core can never be disabled
  if (moduleKey === 'platform_core' && targetMode === 'off') {
    result.allowed = false;
    return result;
  }

  if (targetMode === 'off') {
    // Check: are there modules that depend on this one and are currently active?
    for (const mod of MODULE_REGISTRY) {
      if (mod.dependencies.includes(moduleKey)) {
        const depMode = currentEntitlements.get(mod.key) ?? 'off';
        if (depMode !== 'off') {
          result.dependents.push({ key: mod.key, name: mod.name, currentMode: depMode });
        }
      }
    }
    if (result.dependents.length > 0) {
      result.allowed = false;
    }
    // Reason required for high/critical risk modules
    result.reasonRequired = moduleDef.riskLevel === 'high' || moduleDef.riskLevel === 'critical';
  }

  if (targetMode === 'view' || targetMode === 'full') {
    // Check: are all dependencies satisfied (view or full)?
    for (const depKey of moduleDef.dependencies) {
      if (depKey === 'platform_core') continue; // always on
      const depMode = currentEntitlements.get(depKey) ?? 'off';
      if (depMode === 'off') {
        const depDef = MODULE_REGISTRY.find((m) => m.key === depKey);
        result.missingDependencies.push({
          key: depKey,
          name: depDef?.name ?? depKey,
          currentMode: depMode,
        });
      }
    }
    if (result.missingDependencies.length > 0) {
      result.allowed = false;
    }
  }

  return result;
}

/**
 * Compute the full dependency tree needed to enable a module.
 * Returns modules in dependency order (leaves first).
 */
export function computeDependencyChain(moduleKey: string): ModuleDefinition[] {
  const visited = new Set<string>();
  const chain: ModuleDefinition[] = [];

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const mod = MODULE_REGISTRY.find((m) => m.key === key);
    if (!mod) return;
    for (const dep of mod.dependencies) {
      visit(dep);
    }
    chain.push(mod);
  }

  visit(moduleKey);
  return chain;
}
