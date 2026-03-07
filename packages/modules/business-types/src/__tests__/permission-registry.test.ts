import { describe, it, expect } from 'vitest';
import { VALID_PERMISSION_KEYS, isValidPermissionKey } from '../registries/permission-registry';

describe('permission-registry', () => {
  it('exports a non-empty set of permission keys', () => {
    expect(VALID_PERMISSION_KEYS.size).toBeGreaterThan(0);
  });

  it('isValidPermissionKey returns true for exact match', () => {
    const firstKey = Array.from(VALID_PERMISSION_KEYS)[0]!;
    expect(isValidPermissionKey(firstKey)).toBe(true);
  });

  it('isValidPermissionKey returns false for unknown key', () => {
    expect(isValidPermissionKey('nonexistent.permission.key')).toBe(false);
  });

  it('includes admin-level permission keys', () => {
    expect(VALID_PERMISSION_KEYS.has('admin.business_types.manage')).toBe(true);
    expect(VALID_PERMISSION_KEYS.has('admin.business_types.view')).toBe(true);
  });

  it('all permission keys follow module.action format (except global wildcard)', () => {
    for (const key of VALID_PERMISSION_KEYS) {
      if (key === '*') continue; // global wildcard is valid
      const parts = key.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(2);
    }
  });
});
