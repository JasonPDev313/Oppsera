import { describe, it, expect } from 'vitest';
import { PMS_PERMISSIONS, PMS_ROLE_PERMISSIONS, PMS_ROLES } from '../permissions';
import type { PmsPermission } from '../permissions';

describe('PMS_PERMISSIONS', () => {
  it('has at least 28 permissions', () => {
    const allPerms = Object.values(PMS_PERMISSIONS);
    expect(allPerms.length).toBeGreaterThanOrEqual(28);
  });

  it('all permissions follow pms.* naming convention', () => {
    for (const perm of Object.values(PMS_PERMISSIONS)) {
      expect(perm).toMatch(/^pms\.\w+\.\w+$/);
    }
  });

  it('has no duplicate permission values', () => {
    const values = Object.values(PMS_PERMISSIONS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has no duplicate permission keys', () => {
    const keys = Object.keys(PMS_PERMISSIONS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes core PMS permission categories', () => {
    expect(PMS_PERMISSIONS.PROPERTY_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.ROOMS_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.RESERVATIONS_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.CALENDAR_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.HOUSEKEEPING_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.FOLIO_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.RATES_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.REPORTS_VIEW).toBeDefined();
    expect(PMS_PERMISSIONS.LOYALTY_VIEW).toBeDefined();
  });

  it('has paired view/manage for core categories', () => {
    const viewManagePairs = [
      ['PROPERTY_VIEW', 'PROPERTY_MANAGE'],
      ['ROOMS_VIEW', 'ROOMS_MANAGE'],
      ['HOUSEKEEPING_VIEW', 'HOUSEKEEPING_MANAGE'],
      ['RATES_VIEW', 'RATES_MANAGE'],
      ['GUESTS_VIEW', 'GUESTS_MANAGE'],
      ['LOYALTY_VIEW', 'LOYALTY_MANAGE'],
    ];
    for (const [view, manage] of viewManagePairs) {
      expect(PMS_PERMISSIONS[view as keyof typeof PMS_PERMISSIONS]).toBeDefined();
      expect(PMS_PERMISSIONS[manage as keyof typeof PMS_PERMISSIONS]).toBeDefined();
    }
  });
});

describe('PMS_ROLES', () => {
  it('has 5 roles', () => {
    expect(PMS_ROLES).toHaveLength(5);
  });

  it('includes expected roles', () => {
    expect(PMS_ROLES).toContain('PMS General Manager');
    expect(PMS_ROLES).toContain('PMS Front Desk Agent');
    expect(PMS_ROLES).toContain('PMS Housekeeping');
    expect(PMS_ROLES).toContain('PMS Revenue Manager');
    expect(PMS_ROLES).toContain('PMS Read Only');
  });
});

describe('PMS_ROLE_PERMISSIONS', () => {
  const allPermValues = Object.values(PMS_PERMISSIONS) as PmsPermission[];

  it('General Manager has all permissions', () => {
    const gmPerms = PMS_ROLE_PERMISSIONS['PMS General Manager']!;
    expect(gmPerms).toEqual(allPermValues);
    expect(gmPerms.length).toBe(allPermValues.length);
  });

  it('Read Only has only view permissions', () => {
    const roPerms = PMS_ROLE_PERMISSIONS['PMS Read Only']!;
    for (const perm of roPerms) {
      expect(perm).toMatch(/\.view$/);
    }
  });

  it('Front Desk has check-in/check-out permissions', () => {
    const fdPerms = PMS_ROLE_PERMISSIONS['PMS Front Desk Agent']!;
    expect(fdPerms).toContain(PMS_PERMISSIONS.FRONT_DESK_CHECK_IN);
    expect(fdPerms).toContain(PMS_PERMISSIONS.FRONT_DESK_CHECK_OUT);
    expect(fdPerms).toContain(PMS_PERMISSIONS.FRONT_DESK_NO_SHOW);
  });

  it('Front Desk has reservation CRUD permissions', () => {
    const fdPerms = PMS_ROLE_PERMISSIONS['PMS Front Desk Agent']!;
    expect(fdPerms).toContain(PMS_PERMISSIONS.RESERVATIONS_VIEW);
    expect(fdPerms).toContain(PMS_PERMISSIONS.RESERVATIONS_CREATE);
    expect(fdPerms).toContain(PMS_PERMISSIONS.RESERVATIONS_EDIT);
    expect(fdPerms).toContain(PMS_PERMISSIONS.RESERVATIONS_CANCEL);
  });

  it('Front Desk has calendar permissions', () => {
    const fdPerms = PMS_ROLE_PERMISSIONS['PMS Front Desk Agent']!;
    expect(fdPerms).toContain(PMS_PERMISSIONS.CALENDAR_VIEW);
    expect(fdPerms).toContain(PMS_PERMISSIONS.CALENDAR_MOVE);
    expect(fdPerms).toContain(PMS_PERMISSIONS.CALENDAR_RESIZE);
  });

  it('Housekeeping has limited scope', () => {
    const hkPerms = PMS_ROLE_PERMISSIONS['PMS Housekeeping']!;
    expect(hkPerms).toContain(PMS_PERMISSIONS.HOUSEKEEPING_VIEW);
    expect(hkPerms).toContain(PMS_PERMISSIONS.HOUSEKEEPING_MANAGE);
    expect(hkPerms).toContain(PMS_PERMISSIONS.HOUSEKEEPING_ASSIGN);
    expect(hkPerms).toContain(PMS_PERMISSIONS.HOUSEKEEPING_COMPLETE);
    // Should NOT have reservation or folio access
    expect(hkPerms).not.toContain(PMS_PERMISSIONS.RESERVATIONS_VIEW);
    expect(hkPerms).not.toContain(PMS_PERMISSIONS.FOLIO_VIEW);
  });

  it('Revenue Manager has rates and restrictions permissions', () => {
    const rmPerms = PMS_ROLE_PERMISSIONS['PMS Revenue Manager']!;
    expect(rmPerms).toContain(PMS_PERMISSIONS.RATES_VIEW);
    expect(rmPerms).toContain(PMS_PERMISSIONS.RATES_MANAGE);
    expect(rmPerms).toContain(PMS_PERMISSIONS.RESTRICTIONS_VIEW);
    expect(rmPerms).toContain(PMS_PERMISSIONS.RESTRICTIONS_MANAGE);
    expect(rmPerms).toContain(PMS_PERMISSIONS.REVENUE_VIEW);
    expect(rmPerms).toContain(PMS_PERMISSIONS.REVENUE_MANAGE);
  });

  it('Revenue Manager has channel management', () => {
    const rmPerms = PMS_ROLE_PERMISSIONS['PMS Revenue Manager']!;
    expect(rmPerms).toContain(PMS_PERMISSIONS.CHANNELS_VIEW);
    expect(rmPerms).toContain(PMS_PERMISSIONS.CHANNELS_MANAGE);
  });

  it('all role permissions reference valid PMS_PERMISSIONS values', () => {
    for (const [_role, perms] of Object.entries(PMS_ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(allPermValues).toContain(perm);
      }
    }
  });

  it('no role has duplicate permissions', () => {
    for (const [_role, perms] of Object.entries(PMS_ROLE_PERMISSIONS)) {
      expect(new Set(perms).size).toBe(perms.length);
    }
  });

  it('all roles are subsets of General Manager', () => {
    const gm = new Set(PMS_ROLE_PERMISSIONS['PMS General Manager']!);

    for (const [role, perms] of Object.entries(PMS_ROLE_PERMISSIONS)) {
      if (role === 'PMS General Manager') continue;
      for (const perm of perms) {
        expect(gm.has(perm)).toBe(true);
      }
    }
  });

  it('Front Desk has more permissions than Read Only', () => {
    const ro = PMS_ROLE_PERMISSIONS['PMS Read Only']!;
    const fd = PMS_ROLE_PERMISSIONS['PMS Front Desk Agent']!;
    expect(fd.length).toBeGreaterThan(ro.length);
  });
});
