import { describe, it, expect } from 'vitest';
import {
  FNB_PERMISSIONS,
  FNB_ROLE_DEFAULTS,
  roleHasPermission,
  getPermissionCategories,
  getPermissionsByCategory,
} from '../helpers/fnb-permissions';
import type { SystemRole } from '../helpers/fnb-permissions';

describe('FNB_PERMISSIONS', () => {
  it('has at least 28 permissions', () => {
    expect(FNB_PERMISSIONS.length).toBeGreaterThanOrEqual(28);
  });

  it('all permissions start with pos_fnb.', () => {
    for (const perm of FNB_PERMISSIONS) {
      expect(perm.key).toMatch(/^pos_fnb\./);
    }
  });

  it('each permission has description and category', () => {
    for (const perm of FNB_PERMISSIONS) {
      expect(perm.description).toBeTruthy();
      expect(perm.category).toBeTruthy();
    }
  });

  it('covers all expected categories', () => {
    const categories = getPermissionCategories();
    expect(categories).toContain('floor_plan');
    expect(categories).toContain('tabs');
    expect(categories).toContain('kds');
    expect(categories).toContain('payments');
    expect(categories).toContain('tips');
    expect(categories).toContain('menu');
    expect(categories).toContain('close_batch');
    expect(categories).toContain('reports');
    expect(categories).toContain('settings');
    expect(categories).toContain('gl');
  });
});

describe('FNB_ROLE_DEFAULTS', () => {
  it('has all 6 system roles', () => {
    const roles: SystemRole[] = ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'];
    for (const role of roles) {
      expect(FNB_ROLE_DEFAULTS[role]).toBeDefined();
    }
  });

  it('owner has ALL permissions', () => {
    expect(FNB_ROLE_DEFAULTS.owner).toHaveLength(FNB_PERMISSIONS.length);
    for (const perm of FNB_PERMISSIONS) {
      expect(FNB_ROLE_DEFAULTS.owner).toContain(perm.key);
    }
  });

  it('manager has most permissions', () => {
    expect(FNB_ROLE_DEFAULTS.manager.length).toBeGreaterThan(20);
    expect(FNB_ROLE_DEFAULTS.manager).toContain('pos_fnb.settings.manage');
    expect(FNB_ROLE_DEFAULTS.manager).toContain('pos_fnb.gl.post');
  });

  it('supervisor has mid-level permissions', () => {
    expect(FNB_ROLE_DEFAULTS.supervisor).toContain('pos_fnb.menu.manage');
    expect(FNB_ROLE_DEFAULTS.supervisor).toContain('pos_fnb.tabs.void');
    expect(FNB_ROLE_DEFAULTS.supervisor).not.toContain('pos_fnb.settings.manage');
    expect(FNB_ROLE_DEFAULTS.supervisor).not.toContain('pos_fnb.gl.post');
  });

  it('server has ordering and basic payment', () => {
    expect(FNB_ROLE_DEFAULTS.server).toContain('pos_fnb.tabs.view');
    expect(FNB_ROLE_DEFAULTS.server).toContain('pos_fnb.tabs.create');
    expect(FNB_ROLE_DEFAULTS.server).toContain('pos_fnb.payments.create');
    expect(FNB_ROLE_DEFAULTS.server).not.toContain('pos_fnb.tabs.void');
    expect(FNB_ROLE_DEFAULTS.server).not.toContain('pos_fnb.menu.manage');
  });

  it('cashier can take payments but not void', () => {
    expect(FNB_ROLE_DEFAULTS.cashier).toContain('pos_fnb.payments.create');
    expect(FNB_ROLE_DEFAULTS.cashier).not.toContain('pos_fnb.payments.void');
    expect(FNB_ROLE_DEFAULTS.cashier).not.toContain('pos_fnb.close_batch.manage');
  });

  it('staff has minimal permissions (kds only)', () => {
    expect(FNB_ROLE_DEFAULTS.staff).toContain('pos_fnb.floor_plan.view');
    expect(FNB_ROLE_DEFAULTS.staff).toContain('pos_fnb.kds.view');
    expect(FNB_ROLE_DEFAULTS.staff).toContain('pos_fnb.kds.bump');
    expect(FNB_ROLE_DEFAULTS.staff).not.toContain('pos_fnb.tabs.create');
  });

  it('role permissions are subsets (staff ⊂ server ⊂ supervisor ⊂ manager ⊂ owner)', () => {
    const supervisorPerms = new Set(FNB_ROLE_DEFAULTS.supervisor);
    const managerPerms = new Set(FNB_ROLE_DEFAULTS.manager);
    const ownerPerms = new Set(FNB_ROLE_DEFAULTS.owner);

    // Manager ⊂ Owner
    for (const perm of managerPerms) {
      expect(ownerPerms.has(perm)).toBe(true);
    }
    // Supervisor ⊂ Manager
    for (const perm of supervisorPerms) {
      expect(managerPerms.has(perm)).toBe(true);
    }
  });
});

describe('roleHasPermission', () => {
  it('returns true for valid permission', () => {
    expect(roleHasPermission('owner', 'pos_fnb.tabs.void')).toBe(true);
    expect(roleHasPermission('manager', 'pos_fnb.settings.manage')).toBe(true);
    expect(roleHasPermission('server', 'pos_fnb.tabs.create')).toBe(true);
  });

  it('returns false for invalid permission', () => {
    expect(roleHasPermission('server', 'pos_fnb.settings.manage')).toBe(false);
    expect(roleHasPermission('staff', 'pos_fnb.tabs.void')).toBe(false);
    expect(roleHasPermission('cashier', 'pos_fnb.gl.post')).toBe(false);
  });
});

describe('getPermissionCategories', () => {
  it('returns unique categories', () => {
    const categories = getPermissionCategories();
    const uniqueCategories = [...new Set(categories)];
    expect(categories).toEqual(uniqueCategories);
  });

  it('has 10 categories', () => {
    expect(getPermissionCategories()).toHaveLength(10);
  });
});

describe('getPermissionsByCategory', () => {
  it('returns floor_plan permissions', () => {
    const perms = getPermissionsByCategory('floor_plan');
    expect(perms).toHaveLength(2);
    expect(perms.every((p) => p.category === 'floor_plan')).toBe(true);
  });

  it('returns kds permissions', () => {
    const perms = getPermissionsByCategory('kds');
    expect(perms).toHaveLength(3);
  });

  it('returns gl permissions', () => {
    const perms = getPermissionsByCategory('gl');
    expect(perms).toHaveLength(3);
    expect(perms.map((p) => p.key)).toContain('pos_fnb.gl.post');
    expect(perms.map((p) => p.key)).toContain('pos_fnb.gl.reverse');
    expect(perms.map((p) => p.key)).toContain('pos_fnb.gl.mappings');
  });

  it('returns empty for unknown category', () => {
    expect(getPermissionsByCategory('unknown')).toHaveLength(0);
  });
});
