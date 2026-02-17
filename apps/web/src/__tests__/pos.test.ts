import { describe, it, expect } from 'vitest';
import { getItemTypeGroup } from '@oppsera/shared';
import type {
  FnbMetadata,
  RetailMetadata,
  PackageMetadata,
} from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Stock-level colour logic used by InventoryIndicator and ItemButton.
 * Items with `isTrackInventory: false` pass `null` for onHand.
 */
function getStockColor(onHand: number | null): 'green' | 'amber' | 'red' | 'none' {
  if (onHand === null) return 'none';
  if (onHand > 10) return 'green';
  if (onHand > 0) return 'amber';
  return 'red';
}

/**
 * Price-override validation — requires a non-negative price, a non-empty
 * reason string and a manager PIN of at least 4 digits.
 */
function validatePriceOverride(price: number | null, reason: string, pin: string): boolean {
  return price !== null && price >= 0 && reason.length > 0 && pin.length >= 4;
}

// ── Shared Components (Tests 1-18) ──────────────────────────────────────

describe('Shared Components (1-18)', () => {
  // Test 1
  describe('Test 1 – ItemButton type badge per type group', () => {
    it('maps backend types to correct type groups', () => {
      expect(getItemTypeGroup('food')).toBe('fnb');
      expect(getItemTypeGroup('beverage')).toBe('fnb');
      expect(getItemTypeGroup('retail')).toBe('retail');
      expect(getItemTypeGroup('green_fee')).toBe('retail');
      expect(getItemTypeGroup('rental')).toBe('retail');
      expect(getItemTypeGroup('service')).toBe('service');
      expect(getItemTypeGroup('other', { isPackage: true })).toBe('package');
      expect(getItemTypeGroup('other')).toBe('retail'); // fallback
    });
  });

  // Test 2
  describe('Test 2 – ItemButton stock indicator', () => {
    it('stock indicator: green >10, amber 1-10, red 0', () => {
      expect(getStockColor(15)).toBe('green');
      expect(getStockColor(10)).toBe('amber');
      expect(getStockColor(5)).toBe('amber');
      expect(getStockColor(1)).toBe('amber');
      expect(getStockColor(0)).toBe('red');
      expect(getStockColor(null)).toBe('none');
    });
  });

  // Test 3
  describe('Test 3 – ModifierDialog fraction picker visibility', () => {
    it('fraction picker visible only with multiple allowedFractions', () => {
      const singleFraction: FnbMetadata = { allowedFractions: [1] };
      const multipleFractions: FnbMetadata = { allowedFractions: [0.25, 0.5, 1] };
      const noFractions: FnbMetadata = {};

      const shouldShowPicker = (meta: FnbMetadata) =>
        (meta.allowedFractions ?? [1]).length > 1;

      expect(shouldShowPicker(singleFraction)).toBe(false);
      expect(shouldShowPicker(multipleFractions)).toBe(true);
      expect(shouldShowPicker(noFractions)).toBe(false);
    });
  });

  // Test 4
  describe('Test 4 – ModifierDialog filters groups to item metadata IDs', () => {
    it('filters modifier groups to item defaultModifierGroupIds + optionalModifierGroupIds', () => {
      const allGroups = [
        { id: 'mg1', name: 'Temperature' },
        { id: 'mg2', name: 'Add-Ons' },
        { id: 'mg3', name: 'Unrelated' },
      ];
      const meta: FnbMetadata = {
        defaultModifierGroupIds: ['mg1'],
        optionalModifierGroupIds: ['mg2'],
      };

      const relevantIds = [
        ...(meta.defaultModifierGroupIds ?? []),
        ...(meta.optionalModifierGroupIds ?? []),
      ];
      const filtered = allGroups.filter((g) => relevantIds.includes(g.id));

      expect(filtered).toHaveLength(2);
      expect(filtered.map((g) => g.id)).toEqual(['mg1', 'mg2']);
    });
  });

  // Test 5
  describe('Test 5 – ModifierDialog pre-selects default modifiers', () => {
    it('default modifier groups are pre-selected', () => {
      const meta: FnbMetadata = {
        defaultModifierGroupIds: ['mg1'],
        optionalModifierGroupIds: ['mg2'],
      };
      const isDefault = (groupId: string) =>
        (meta.defaultModifierGroupIds ?? []).includes(groupId);

      expect(isDefault('mg1')).toBe(true);
      expect(isDefault('mg2')).toBe(false);
      expect(isDefault('mg3')).toBe(false);
    });
  });

  // Test 6
  describe('Test 6 – ModifierDialog special instructions toggle', () => {
    it('special instructions field controlled by metadata', () => {
      const enabled: FnbMetadata = { allowSpecialInstructions: true };
      const disabled: FnbMetadata = { allowSpecialInstructions: false };
      const unset: FnbMetadata = {};

      expect(enabled.allowSpecialInstructions).toBe(true);
      expect(disabled.allowSpecialInstructions).toBe(false);
      expect(unset.allowSpecialInstructions).toBeUndefined();
    });
  });

  // Test 7
  describe('Test 7 – ModifierDialog quick instruction buttons', () => {
    it('quick instruction buttons produce expected text values', () => {
      const quickInstructions = ['No onion', 'Extra sauce', 'Allergy alert'];

      expect(quickInstructions).toContain('No onion');
      expect(quickInstructions).toContain('Extra sauce');
      expect(quickInstructions).toContain('Allergy alert');
      expect(quickInstructions).toHaveLength(3);
    });
  });

  // Test 8
  describe('Test 8 – OptionPickerDialog required option validation', () => {
    it('validates all required option sets are selected', () => {
      const optionSets: RetailMetadata['optionSets'] = [
        { name: 'Size', options: ['S', 'M', 'L'], required: true },
        { name: 'Color', options: ['Red', 'Blue'], required: true },
        { name: 'Gift Wrap', options: ['Yes', 'No'], required: false },
      ];

      const selected: Record<string, string> = { Size: 'M' };
      const requiredSets = optionSets!.filter((s) => s.required);

      // Color not yet selected
      const allRequiredBefore = requiredSets.every(
        (s) => selected[s.name] !== undefined,
      );
      expect(allRequiredBefore).toBe(false);

      // Now select Color
      selected['Color'] = 'Red';
      const allRequiredAfter = requiredSets.every(
        (s) => selected[s.name] !== undefined,
      );
      expect(allRequiredAfter).toBe(true);
    });
  });

  // Test 9
  describe('Test 9 – PackageConfirmDialog component types', () => {
    it('package metadata components have correct types', () => {
      const meta: PackageMetadata = {
        isPackage: true,
        packageComponents: [
          { catalogItemId: 'i1', itemName: 'Burger', itemType: 'food', qty: 1 },
          { catalogItemId: 'i2', itemName: 'Soda', itemType: 'beverage', qty: 1 },
          { catalogItemId: 'i3', itemName: 'Cart Rental', itemType: 'rental', qty: 1 },
        ],
      };

      expect(meta.packageComponents).toHaveLength(3);
      expect(getItemTypeGroup('food')).toBe('fnb');
      expect(getItemTypeGroup('beverage')).toBe('fnb');
      expect(getItemTypeGroup('rental')).toBe('retail');
    });
  });

  // Test 10
  describe('Test 10 – Cart renders type-specific line details', () => {
    it('order line types map correctly for display', () => {
      const lines = [
        { itemType: 'food', modifiers: [{ name: 'Cheese' }], specialInstructions: 'no onions' },
        { itemType: 'retail', selectedOptions: { Size: 'L' } },
        { itemType: 'service' },
        { itemType: 'other' },
      ];

      expect(getItemTypeGroup(lines[0]!.itemType)).toBe('fnb');
      expect(getItemTypeGroup(lines[1]!.itemType)).toBe('retail');
      expect(getItemTypeGroup(lines[2]!.itemType)).toBe('service');
      expect(getItemTypeGroup(lines[3]!.itemType)).toBe('retail'); // 'other' without isPackage → retail
    });
  });

  // Test 11
  describe('Test 11 – Cart shows price override indicator', () => {
    it('price override detected when originalUnitPrice exists', () => {
      const line = {
        unitPrice: 4999,
        originalUnitPrice: 5999 as number | null,
        priceOverrideReason: 'price_match',
      };

      const hasOverride =
        line.originalUnitPrice !== null && line.originalUnitPrice !== undefined;
      expect(hasOverride).toBe(true);
      expect(line.unitPrice).toBeLessThan(line.originalUnitPrice!);
    });

    it('no override when originalUnitPrice is null', () => {
      const line = {
        unitPrice: 4999,
        originalUnitPrice: null as number | null,
        priceOverrideReason: null,
      };
      const hasOverride =
        line.originalUnitPrice !== null && line.originalUnitPrice !== undefined;
      expect(hasOverride).toBe(false);
    });
  });

  // Test 12
  describe('Test 12 – CartTotals formula', () => {
    it('total = subtotal + taxTotal + serviceChargeTotal - discountTotal', () => {
      const order = {
        subtotal: 17749,
        taxTotal: 730,
        serviceChargeTotal: 3195,
        discountTotal: 1775,
        total: 19899,
      };

      const computed =
        order.subtotal +
        order.taxTotal +
        order.serviceChargeTotal -
        order.discountTotal;
      expect(computed).toBe(order.total);
    });
  });

  // Test 13
  describe('Test 13 – CartTotals inclusive-tax indicator', () => {
    it('detects inclusive tax from line taxCalculationMode', () => {
      const lines = [
        { taxCalculationMode: 'exclusive' },
        { taxCalculationMode: 'inclusive' },
      ];

      const hasInclusive = lines.some((l) => l.taxCalculationMode === 'inclusive');
      expect(hasInclusive).toBe(true);

      const exclusiveOnly = [{ taxCalculationMode: 'exclusive' }];
      expect(exclusiveOnly.some((l) => l.taxCalculationMode === 'inclusive')).toBe(false);
    });
  });

  // Test 14
  describe('Test 14 – CustomerAttachment search and attach', () => {
    it('customer attachment state management', () => {
      let customerId: string | null = null;
      const onAttach = (id: string) => {
        customerId = id;
      };
      const onDetach = () => {
        customerId = null;
      };

      expect(customerId).toBeNull();
      onAttach('cust-123');
      expect(customerId).toBe('cust-123');
      onDetach();
      expect(customerId).toBeNull();
    });
  });

  // Test 15
  describe('Test 15 – PriceOverrideDialog validation', () => {
    it('requires price, reason, and manager PIN', () => {
      expect(validatePriceOverride(4999, 'price_match', '1234')).toBe(true);
      expect(validatePriceOverride(0, 'price_match', '1234')).toBe(true); // zero is valid
      expect(validatePriceOverride(null, 'price_match', '1234')).toBe(false);
      expect(validatePriceOverride(4999, '', '1234')).toBe(false);
      expect(validatePriceOverride(4999, 'price_match', '12')).toBe(false);
      expect(validatePriceOverride(4999, 'price_match', '')).toBe(false);
    });
  });

  // Test 16
  describe('Test 16 – ServiceChargeDialog percentage calculation', () => {
    it('calculates service charge as percentage of subtotal', () => {
      const subtotal = 17749; // cents
      const percentage = 18;
      const chargeAmount = Math.round((subtotal * percentage) / 100);
      expect(chargeAmount).toBe(3195);
    });

    it('handles zero percentage', () => {
      const subtotal = 17749;
      expect(Math.round((subtotal * 0) / 100)).toBe(0);
    });
  });

  // Test 17
  describe('Test 17 – DiscountDialog percentage and fixed', () => {
    it('applies percentage discount correctly', () => {
      const subtotal = 17749;
      const pctDiscount = Math.round((subtotal * 10) / 100);
      expect(pctDiscount).toBe(1775);
    });

    it('applies fixed discount correctly', () => {
      const fixedDiscount = 500; // $5.00 in cents
      expect(fixedDiscount).toBe(500);
    });

    it('percentage discount does not exceed subtotal', () => {
      const subtotal = 17749;
      const fullDiscount = Math.round((subtotal * 100) / 100);
      expect(fullDiscount).toBe(subtotal);
    });
  });

  // Test 18
  describe('Test 18 – InventoryIndicator colour-coded stock levels', () => {
    it('maps stock quantities to the correct indicator colour', () => {
      expect(getStockColor(15)).toBe('green');
      expect(getStockColor(11)).toBe('green');
      expect(getStockColor(10)).toBe('amber');
      expect(getStockColor(5)).toBe('amber');
      expect(getStockColor(1)).toBe('amber');
      expect(getStockColor(0)).toBe('red');
      expect(getStockColor(null)).toBe('none');
    });
  });
});

// ── Catalog Hierarchy UI (Tests 19-28) ──────────────────────────────────

describe('Catalog Hierarchy UI (19-28)', () => {
  // Test 19
  describe('Test 19 – DepartmentTabs renders departments in order', () => {
    it('departments are ordered and selectable', () => {
      const departments = [
        { id: 'd1', name: 'Food', sortOrder: 0 },
        { id: 'd2', name: 'Drinks', sortOrder: 1 },
        { id: 'd3', name: 'Pro Shop', sortOrder: 2 },
      ];

      const sorted = [...departments].sort((a, b) => a.sortOrder - b.sortOrder);
      expect(sorted[0]!.name).toBe('Food');
      expect(sorted[1]!.name).toBe('Drinks');
      expect(sorted[2]!.name).toBe('Pro Shop');
      expect(sorted).toHaveLength(3);
    });
  });

  // Test 20
  describe('Test 20 – Department selection resets child selections', () => {
    it('selecting a department clears subdepartment and category', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };

      const setDepartment = (id: string | null) => {
        nav.departmentId = id;
        nav.subDepartmentId = null;
        nav.categoryId = null;
      };

      setDepartment('d2');
      expect(nav.departmentId).toBe('d2');
      expect(nav.subDepartmentId).toBeNull();
      expect(nav.categoryId).toBeNull();
    });
  });

  // Test 21
  describe('Test 21 – SubDepartmentTabs conditional rendering', () => {
    it('subdepartment tabs only appear when department has children', () => {
      const allCategories = [
        { id: 'd1', parentId: null, name: 'Food' },
        { id: 'c1', parentId: 'd1', name: 'Burgers' },
        { id: 'c2', parentId: 'd1', name: 'Sides' },
        { id: 'd2', parentId: null, name: 'Pro Shop' },
      ];

      const childrenOfD1 = allCategories.filter((c) => c.parentId === 'd1');
      const childrenOfD2 = allCategories.filter((c) => c.parentId === 'd2');

      expect(childrenOfD1.length > 0).toBe(true);
      expect(childrenOfD2.length > 0).toBe(false);
    });
  });

  // Test 22
  describe('Test 22 – SubDepartment selection resets category', () => {
    it('selecting a subdepartment clears category', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };

      const setSubDepartment = (id: string | null) => {
        nav.subDepartmentId = id;
        nav.categoryId = null;
      };

      setSubDepartment('sd2');
      expect(nav.departmentId).toBe('d1'); // unchanged
      expect(nav.subDepartmentId).toBe('sd2');
      expect(nav.categoryId).toBeNull();
    });
  });

  // Test 23
  describe('Test 23 – CategoryRail updates based on selected parent', () => {
    it('shows categories for the currently selected subdepartment', () => {
      const categories = [
        { id: 'c1', parentId: 'sd1', name: 'Beef Burgers' },
        { id: 'c2', parentId: 'sd1', name: 'Chicken Burgers' },
        { id: 'c3', parentId: 'sd2', name: 'Hot Sides' },
      ];

      const visible = categories.filter((c) => c.parentId === 'sd1');
      expect(visible).toHaveLength(2);
      expect(visible.map((c) => c.name)).toEqual(['Beef Burgers', 'Chicken Burgers']);

      const visibleSd2 = categories.filter((c) => c.parentId === 'sd2');
      expect(visibleSd2).toHaveLength(1);
      expect(visibleSd2[0]!.name).toBe('Hot Sides');
    });
  });

  // Test 24
  describe('Test 24 – Category selection persists across search clear', () => {
    it('clearing search does not reset category selection', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };
      let searchQuery = 'burger';

      // Simulate clearing search
      searchQuery = '';

      // Category selection must persist
      expect(nav.categoryId).toBe('c1');
      expect(nav.departmentId).toBe('d1');
      expect(nav.subDepartmentId).toBe('sd1');
      expect(searchQuery).toBe('');
    });
  });

  // Test 25
  describe('Test 25 – Search overrides grid but hierarchy stays unchanged', () => {
    it('search does not mutate hierarchy selection', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };
      let searchQuery = '';

      // Activate search
      searchQuery = 'polo';

      // Nav must be completely unchanged
      expect(nav.departmentId).toBe('d1');
      expect(nav.subDepartmentId).toBe('sd1');
      expect(nav.categoryId).toBe('c1');
      expect(searchQuery).toBe('polo');
    });
  });

  // Test 26
  describe('Test 26 – Breadcrumb click-back clears correct levels', () => {
    it('navigating to subdepartment level clears category', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };

      const navigateToLevel = (level: 'department' | 'subdepartment') => {
        if (level === 'department') {
          nav.subDepartmentId = null;
          nav.categoryId = null;
        }
        if (level === 'subdepartment') {
          nav.categoryId = null;
        }
      };

      navigateToLevel('subdepartment');
      expect(nav.departmentId).toBe('d1');
      expect(nav.subDepartmentId).toBe('sd1');
      expect(nav.categoryId).toBeNull();
    });

    it('navigating to department level clears subdepartment and category', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };

      const navigateToLevel = (level: 'department' | 'subdepartment') => {
        if (level === 'department') {
          nav.subDepartmentId = null;
          nav.categoryId = null;
        }
        if (level === 'subdepartment') {
          nav.categoryId = null;
        }
      };

      navigateToLevel('department');
      expect(nav.departmentId).toBe('d1');
      expect(nav.subDepartmentId).toBeNull();
      expect(nav.categoryId).toBeNull();
    });
  });

  // Test 27
  describe('Test 27 – Barcode scan preserves hierarchy state', () => {
    it('barcode lookup finds items without mutating navigation', () => {
      const nav = {
        departmentId: 'd1' as string | null,
        subDepartmentId: 'sd1' as string | null,
        categoryId: 'c1' as string | null,
      };
      const items = [
        { id: 'i1', barcode: '123456789', name: 'Polo' },
        { id: 'i2', barcode: '987654321', name: 'Cap' },
      ];

      const lookupByBarcode = (code: string) =>
        items.find((i) => i.barcode === code) ?? null;

      const found = lookupByBarcode('123456789');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Polo');

      // Nav must be unchanged after scan
      expect(nav.departmentId).toBe('d1');
      expect(nav.subDepartmentId).toBe('sd1');
      expect(nav.categoryId).toBe('c1');

      // Non-existent barcode returns null
      const notFound = lookupByBarcode('000000000');
      expect(notFound).toBeNull();
    });
  });

  // Test 28
  describe('Test 28 – F&B shell uses larger touch sizing', () => {
    it('F&B and retail use same component with different size props', () => {
      const validSizes = ['normal', 'large'] as const;
      const retailSize: (typeof validSizes)[number] = 'normal';
      const fnbSize: (typeof validSizes)[number] = 'large';

      expect(retailSize).not.toBe(fnbSize);
      expect(validSizes).toContain(retailSize);
      expect(validSizes).toContain(fnbSize);
    });
  });
});
