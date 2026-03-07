import { MODULE_REGISTRY as CORE_MODULE_REGISTRY } from '@oppsera/core';
import type { ModuleDefinition } from '@oppsera/core';

export type ModuleRegistryEntry = {
  key: string;
  label: string;
  description: string;
  category: 'core' | 'commerce' | 'operations' | 'finance' | 'analytics' | 'integrations';
  dependencies: string[];
  incompatibleWith: string[];
  accessModes: ('off' | 'view' | 'full')[];
};

function toRegistryEntry(def: ModuleDefinition): ModuleRegistryEntry {
  return {
    key: def.key,
    label: def.name,
    description: def.description,
    category: def.category,
    dependencies: [...def.dependencies],
    incompatibleWith: [],
    accessModes: def.supportsViewMode ? ['off', 'view', 'full'] : ['off', 'full'],
  };
}

export const MODULE_ENTRIES: ModuleRegistryEntry[] = CORE_MODULE_REGISTRY.map(toRegistryEntry);

export const VALID_MODULE_KEYS = new Set(MODULE_ENTRIES.map((m) => m.key));

export function getModuleEntry(key: string): ModuleRegistryEntry | undefined {
  return MODULE_ENTRIES.find((m) => m.key === key);
}

export function getModulesByCategory(): Map<string, ModuleRegistryEntry[]> {
  const grouped = new Map<string, ModuleRegistryEntry[]>();
  for (const entry of MODULE_ENTRIES) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }
  return grouped;
}
