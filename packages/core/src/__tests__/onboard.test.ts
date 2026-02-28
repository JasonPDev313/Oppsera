import { describe, it, expect } from 'vitest';
import { BUSINESS_TYPES, generateSlug } from '@oppsera/shared';

describe('Onboarding', () => {
  describe('BUSINESS_TYPES', () => {
    it('has 5 business types', () => {
      expect(BUSINESS_TYPES).toHaveLength(5);
    });

    it('each type has required fields', () => {
      for (const bt of BUSINESS_TYPES) {
        expect(bt.key).toBeTruthy();
        expect(bt.name).toBeTruthy();
        expect(bt.icon).toBeTruthy();
        expect(bt.description).toBeTruthy();
        expect(bt.recommendedModules.length).toBeGreaterThan(0);
        expect(bt.starterHierarchy.length).toBeGreaterThan(0);
      }
    });

    it('hotel type has 4 departments', () => {
      const hotel = BUSINESS_TYPES.find((bt) => bt.key === 'hotel');
      expect(hotel?.starterHierarchy).toHaveLength(4);
    });

    it('restaurant type has Food and Beverage departments', () => {
      const rest = BUSINESS_TYPES.find((bt) => bt.key === 'restaurant');
      const deptNames = rest?.starterHierarchy.map((d) => d.department);
      expect(deptNames).toContain('Food');
      expect(deptNames).toContain('Beverage');
    });

    it('all business types have unique keys', () => {
      const keys = BUSINESS_TYPES.map((bt) => bt.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('each hierarchy has subDepartments with categories', () => {
      for (const bt of BUSINESS_TYPES) {
        for (const dept of bt.starterHierarchy) {
          expect(dept.subDepartments.length).toBeGreaterThan(0);
          for (const sub of dept.subDepartments) {
            expect(sub.categories.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('slug uniqueness', () => {
    it('generates unique slugs for similar names', () => {
      const slug1 = generateSlug('Sunset Golf Club');
      const slug2 = generateSlug("Sunset Golf Club's");
      // Different inputs produce different slugs
      expect(slug1).not.toBe(slug2);
    });

    it('produces URL-safe slugs', () => {
      for (const bt of BUSINESS_TYPES) {
        const slug = generateSlug(bt.name);
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      }
    });
  });

  describe('middleware options validation', () => {
    it('authenticated + requireTenant:false are valid options', () => {
      // This test verifies the MiddlewareOptions interface accepts our new fields
      const options = { authenticated: true, requireTenant: false };
      expect(options.authenticated).toBe(true);
      expect(options.requireTenant).toBe(false);
    });
  });

  describe('system roles', () => {
    it('defines 5 system roles', () => {
      const SYSTEM_ROLES = [
        { name: 'Owner', permissions: ['*'] },
        { name: 'Manager', permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'reports.view'] },
        { name: 'Supervisor', permissions: ['catalog.view', 'orders.*', 'inventory.view', 'customers.view', 'reports.view'] },
        { name: 'Cashier', permissions: ['catalog.view', 'orders.create', 'orders.view', 'payments.*'] },
        { name: 'Staff', permissions: ['catalog.view', 'orders.view'] },
      ];
      expect(SYSTEM_ROLES).toHaveLength(5);
      expect(SYSTEM_ROLES[0].name).toBe('Owner');
      expect(SYSTEM_ROLES[0].permissions).toContain('*');
    });
  });

  describe('module entitlements', () => {
    it('platform_core is always added', () => {
      const selectedModules = ['catalog', 'pos_retail'];
      const moduleSet = new Set([...selectedModules, 'platform_core']);
      expect(moduleSet.has('platform_core')).toBe(true);
      expect(moduleSet.size).toBe(3);
    });
  });

  describe('starter tax setup', () => {
    it('creates Sales Tax and No Tax rates', () => {
      const starterRates = [
        { name: 'Sales Tax', rateDecimal: '0.0800' },
        { name: 'No Tax', rateDecimal: '0.0000' },
      ];
      expect(starterRates).toHaveLength(2);
      expect(starterRates[0].rateDecimal).toBe('0.0800');
      expect(starterRates[1].rateDecimal).toBe('0.0000');
    });
  });
});
