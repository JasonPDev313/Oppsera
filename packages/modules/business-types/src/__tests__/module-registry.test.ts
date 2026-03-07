import { describe, it, expect } from 'vitest';
import { MODULE_ENTRIES, VALID_MODULE_KEYS, getModuleEntry, getModulesByCategory } from '../registries/module-registry';

describe('module-registry', () => {
  it('exports a non-empty list of module entries', () => {
    expect(MODULE_ENTRIES.length).toBeGreaterThan(0);
  });

  it('VALID_MODULE_KEYS contains all entry keys', () => {
    for (const entry of MODULE_ENTRIES) {
      expect(VALID_MODULE_KEYS.has(entry.key)).toBe(true);
    }
  });

  it('getModuleEntry returns the entry for a known key', () => {
    const first = MODULE_ENTRIES[0]!;
    expect(getModuleEntry(first.key)).toEqual(first);
  });

  it('getModuleEntry returns undefined for unknown key', () => {
    expect(getModuleEntry('nonexistent-module')).toBeUndefined();
  });

  it('getModulesByCategory groups entries by category', () => {
    const grouped = getModulesByCategory();
    expect(grouped.size).toBeGreaterThan(0);

    let totalEntries = 0;
    for (const entries of grouped.values()) {
      totalEntries += entries.length;
    }
    expect(totalEntries).toBe(MODULE_ENTRIES.length);
  });

  it('every entry has required fields', () => {
    for (const entry of MODULE_ENTRIES) {
      expect(entry.key).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(Array.isArray(entry.dependencies)).toBe(true);
      expect(Array.isArray(entry.accessModes)).toBe(true);
      expect(entry.accessModes.length).toBeGreaterThan(0);
    }
  });

  it('dependencies reference valid module keys', () => {
    for (const entry of MODULE_ENTRIES) {
      for (const dep of entry.dependencies) {
        expect(VALID_MODULE_KEYS.has(dep)).toBe(true);
      }
    }
  });
});
