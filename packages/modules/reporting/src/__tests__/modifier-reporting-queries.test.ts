import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ────────────────────────────────────────────

let mockDbRows: Record<string, unknown>[] = [];

// ── Module mocks ─────────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: any) => Promise<any>) => {
    const mockTx = {
      execute: vi.fn(async () => mockDbRows),
    };
    return fn(mockTx);
  }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({
      strings,
      _values,
      type: 'sql',
    }),
    {
      join: vi.fn((items: any[], sep: any) => ({
        items,
        sep,
        type: 'sql-join',
      })),
    },
  ),
}));

vi.mock('../helpers/modifier-recommendations', () => ({
  computeModifierGroupHealth: vi.fn((groups: any[]) =>
    groups.map((g: any) => ({
      ...g,
      attachRate:
        g.eligibleLineCount > 0
          ? g.linesWithSelection / g.eligibleLineCount
          : 0,
      avgSelectionsPerCheck:
        g.linesWithSelection > 0
          ? g.totalSelections / g.linesWithSelection
          : 0,
      voidRate: 0,
      recommendation: 'keep',
      recommendationLabel: 'High-Performing',
    })),
  ),
}));

// ── Imports (after mocks) ────────────────────────────────────────

import { getModifierPerformance } from '../queries/get-modifier-performance';
import { getModifierGroupHealth } from '../queries/get-modifier-group-health';
import { getModifierUpsellImpact } from '../queries/get-modifier-upsell-impact';
import { getModifierDaypartHeatmap } from '../queries/get-modifier-daypart-heatmap';
import { getModifierGroupItemHeatmap } from '../queries/get-modifier-group-item-heatmap';
import { getModifierLocationHeatmap } from '../queries/get-modifier-location-heatmap';
import { getModifierWasteSignals } from '../queries/get-modifier-waste-signals';
import { getModifierComplexity } from '../queries/get-modifier-complexity';
import { computeModifierGroupHealth } from '../helpers/modifier-recommendations';

// ── Helpers ──────────────────────────────────────────────────────

const BASE_INPUT = {
  tenantId: 'tenant-1',
  dateFrom: '2026-01-01',
  dateTo: '2026-01-31',
};

// ── Reset ────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbRows = [];
  vi.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════
// 1. getModifierPerformance
// ═════════════════════════════════════════════════════════════════

describe('getModifierPerformance', () => {
  it('returns mapped rows with correct camelCase field names', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-1',
        modifier_name: 'Extra Cheese',
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        times_selected: 100,
        revenue_dollars: '25.5000',
        extra_revenue_dollars: '10.0000',
        instruction_none: 30,
        instruction_extra: 40,
        instruction_on_side: 20,
        instruction_default: 10,
        void_count: 5,
        void_revenue_dollars: '2.5000',
      },
    ];

    const result = await getModifierPerformance(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      modifierId: 'mod-1',
      modifierName: 'Extra Cheese',
      modifierGroupId: 'grp-1',
      groupName: 'Toppings',
      timesSelected: 100,
      revenueDollars: 25.5,
      extraRevenueDollars: 10,
      instructionNone: 30,
      instructionExtra: 40,
      instructionOnSide: 20,
      instructionDefault: 10,
      voidCount: 5,
      voidRevenueDollars: 2.5,
    });
  });

  it('returns empty array when DB returns no rows', async () => {
    mockDbRows = [];

    const result = await getModifierPerformance(BASE_INPUT);

    expect(result).toEqual([]);
  });

  it('handles null modifier_name gracefully (defaults to empty string)', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-2',
        modifier_name: null,
        modifier_group_id: 'grp-2',
        group_name: null,
        times_selected: 0,
        revenue_dollars: '0.0000',
        extra_revenue_dollars: '0.0000',
        instruction_none: 0,
        instruction_extra: 0,
        instruction_on_side: 0,
        instruction_default: 0,
        void_count: 0,
        void_revenue_dollars: '0.0000',
      },
    ];

    const result = await getModifierPerformance(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.modifierName).toBe('');
    expect(result[0]!.groupName).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. getModifierGroupHealth
// ═════════════════════════════════════════════════════════════════

describe('getModifierGroupHealth', () => {
  it('calls computeModifierGroupHealth with mapped DB rows', async () => {
    mockDbRows = [
      {
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        is_required: true,
        eligible_line_count: 200,
        lines_with_selection: 150,
        total_modifier_selections: 300,
        unique_modifiers_selected: 8,
        revenue_impact_dollars: '120.0000',
        void_count: 3,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await getModifierGroupHealth(BASE_INPUT);

    expect(computeModifierGroupHealth).toHaveBeenCalledTimes(1);
    const callArg = (computeModifierGroupHealth as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0]).toEqual({
      modifierGroupId: 'grp-1',
      groupName: 'Toppings',
      isRequired: true,
      eligibleLineCount: 200,
      linesWithSelection: 150,
      totalSelections: 300,
      uniqueModifiers: 8,
      revenueImpactDollars: 120,
      voidCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns enriched results from recommendation engine', async () => {
    mockDbRows = [
      {
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        is_required: false,
        eligible_line_count: 100,
        lines_with_selection: 80,
        total_modifier_selections: 160,
        unique_modifiers_selected: 5,
        revenue_impact_dollars: '50.0000',
        void_count: 0,
        created_at: null,
      },
    ];

    const result = await getModifierGroupHealth(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      attachRate: 0.8,
      avgSelectionsPerCheck: 2,
      voidRate: 0,
      recommendation: 'keep',
      recommendationLabel: 'High-Performing',
    });
  });

  it('returns empty array when DB returns no rows', async () => {
    mockDbRows = [];

    const result = await getModifierGroupHealth(BASE_INPUT);

    expect(result).toEqual([]);
    expect(computeModifierGroupHealth).toHaveBeenCalledWith([]);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. getModifierUpsellImpact
// ═════════════════════════════════════════════════════════════════

describe('getModifierUpsellImpact', () => {
  it('returns mapped rows with correct revenue/cost/margin fields', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-1',
        modifier_name: 'Bacon',
        group_name: 'Add-ons',
        times_selected: 50,
        revenue_dollars: '75.0000',
        unit_cost: '0.5000',
        margin_dollars: '50.0000',
        margin_percent: '66.67',
      },
    ];

    const result = await getModifierUpsellImpact(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      modifierId: 'mod-1',
      modifierName: 'Bacon',
      groupName: 'Add-ons',
      timesSelected: 50,
      revenueDollars: 75,
      costDollars: 25, // unitCost (0.5) * timesSelected (50)
      marginDollars: 50,
      marginPercent: 66.67,
    });
  });

  it('returns null for marginDollars when cost is null', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-2',
        modifier_name: 'Gluten Free Bun',
        group_name: 'Substitutions',
        times_selected: 20,
        revenue_dollars: '40.0000',
        unit_cost: null,
        margin_dollars: null,
        margin_percent: null,
      },
    ];

    const result = await getModifierUpsellImpact(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.costDollars).toBeNull();
    expect(result[0]!.marginDollars).toBeNull();
    expect(result[0]!.marginPercent).toBeNull();
  });

  it('handles null cost gracefully with correct field mapping', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-3',
        modifier_name: null,
        group_name: null,
        times_selected: 10,
        revenue_dollars: '15.0000',
        unit_cost: null,
        margin_dollars: null,
        margin_percent: null,
      },
    ];

    const result = await getModifierUpsellImpact(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.modifierName).toBe('');
    expect(result[0]!.groupName).toBe('');
    expect(result[0]!.costDollars).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. getModifierDaypartHeatmap
// ═════════════════════════════════════════════════════════════════

describe('getModifierDaypartHeatmap', () => {
  it('returns mapped rows with daypart field', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-1',
        modifier_name: 'Extra Cheese',
        daypart: 'lunch',
        times_selected: 45,
        revenue_dollars: '22.5000',
      },
      {
        modifier_id: 'mod-1',
        modifier_name: 'Extra Cheese',
        daypart: 'dinner',
        times_selected: 30,
        revenue_dollars: '15.0000',
      },
    ];

    const result = await getModifierDaypartHeatmap(BASE_INPUT);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      modifierId: 'mod-1',
      modifierName: 'Extra Cheese',
      daypart: 'lunch',
      timesSelected: 45,
      revenueDollars: 22.5,
    });
    expect(result[1]!.daypart).toBe('dinner');
  });

  it('returns empty array when no rows', async () => {
    mockDbRows = [];

    const result = await getModifierDaypartHeatmap(BASE_INPUT);

    expect(result).toEqual([]);
  });

  it('correctly maps revenue_dollars to revenueDollars', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-5',
        modifier_name: 'Truffle Oil',
        daypart: 'brunch',
        times_selected: 12,
        revenue_dollars: '36.7500',
      },
    ];

    const result = await getModifierDaypartHeatmap(BASE_INPUT);

    expect(result[0]!.revenueDollars).toBe(36.75);
    expect(result[0]!.timesSelected).toBe(12);
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. getModifierGroupItemHeatmap
// ═════════════════════════════════════════════════════════════════

describe('getModifierGroupItemHeatmap', () => {
  it('returns rows with correct field mapping', async () => {
    mockDbRows = [
      {
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        catalog_item_id: 'item-1',
        catalog_item_name: 'Classic Burger',
        times_selected: 80,
      },
    ];

    const result = await getModifierGroupItemHeatmap(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      modifierGroupId: 'grp-1',
      groupName: 'Toppings',
      catalogItemId: 'item-1',
      catalogItemName: 'Classic Burger',
      timesSelected: 80,
    });
  });

  it('defaults timesSelected to 0 when value is falsy', async () => {
    mockDbRows = [
      {
        modifier_group_id: 'grp-2',
        group_name: 'Sides',
        catalog_item_id: 'item-2',
        catalog_item_name: 'Salad',
        times_selected: 0,
      },
    ];

    const result = await getModifierGroupItemHeatmap(BASE_INPUT);

    expect(result[0]!.timesSelected).toBe(0);
  });

  it('returns empty array when no rows', async () => {
    mockDbRows = [];

    const result = await getModifierGroupItemHeatmap(BASE_INPUT);

    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. getModifierLocationHeatmap
// ═════════════════════════════════════════════════════════════════

describe('getModifierLocationHeatmap', () => {
  it('returns rows with locationName from join', async () => {
    mockDbRows = [
      {
        location_id: 'loc-1',
        location_name: 'Downtown Store',
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        eligible_line_count: 200,
        lines_with_selection: 160,
        revenue_impact_dollars: '80.0000',
      },
    ];

    const result = await getModifierLocationHeatmap(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.locationId).toBe('loc-1');
    expect(result[0]!.locationName).toBe('Downtown Store');
    expect(result[0]!.modifierGroupId).toBe('grp-1');
    expect(result[0]!.groupName).toBe('Toppings');
    expect(result[0]!.revenueImpactDollars).toBe(80);
  });

  it('computes attachRate correctly', async () => {
    mockDbRows = [
      {
        location_id: 'loc-2',
        location_name: 'Airport',
        modifier_group_id: 'grp-1',
        group_name: 'Toppings',
        eligible_line_count: 100,
        lines_with_selection: 75,
        revenue_impact_dollars: '50.0000',
      },
    ];

    const result = await getModifierLocationHeatmap(BASE_INPUT);

    expect(result[0]!.attachRate).toBe(0.75);
    expect(result[0]!.eligibleLineCount).toBe(100);
    expect(result[0]!.linesWithSelection).toBe(75);
  });

  it('returns empty array when no rows', async () => {
    mockDbRows = [];

    const result = await getModifierLocationHeatmap(BASE_INPUT);

    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. getModifierWasteSignals
// ═════════════════════════════════════════════════════════════════

describe('getModifierWasteSignals', () => {
  it('returns rows with computed voidRate sorted by highest first', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-bad',
        modifier_name: 'Oyster Sauce',
        group_name: 'Sauces',
        times_selected: 20,
        void_count: 10,
        void_revenue_dollars: '15.0000',
      },
      {
        modifier_id: 'mod-ok',
        modifier_name: 'Ketchup',
        group_name: 'Sauces',
        times_selected: 100,
        void_count: 5,
        void_revenue_dollars: '2.5000',
      },
    ];

    const result = await getModifierWasteSignals(BASE_INPUT);

    expect(result).toHaveLength(2);
    // First row: Oyster Sauce voidRate = 10/20 = 0.5
    expect(result[0]!.voidRate).toBe(0.5);
    expect(result[0]!.modifierName).toBe('Oyster Sauce');
    // Second row: Ketchup voidRate = 5/100 = 0.05
    expect(result[1]!.voidRate).toBe(0.05);
    expect(result[1]!.modifierName).toBe('Ketchup');
  });

  it('computes voidRate = voidCount / timesSelected', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-1',
        modifier_name: 'Jalapeno',
        group_name: 'Peppers',
        times_selected: 40,
        void_count: 8,
        void_revenue_dollars: '6.0000',
      },
    ];

    const result = await getModifierWasteSignals(BASE_INPUT);

    expect(result[0]!.voidRate).toBe(0.2); // 8 / 40
    expect(result[0]!.voidCount).toBe(8);
    expect(result[0]!.timesSelected).toBe(40);
    expect(result[0]!.voidRevenueDollars).toBe(6);
  });

  it('returns voidRate = 0 when timesSelected is 0', async () => {
    mockDbRows = [
      {
        modifier_id: 'mod-edge',
        modifier_name: 'Ghost Pepper',
        group_name: 'Hot Sauces',
        times_selected: 0,
        void_count: 0,
        void_revenue_dollars: '0.0000',
      },
    ];

    const result = await getModifierWasteSignals(BASE_INPUT);

    expect(result[0]!.voidRate).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. getModifierComplexity
// ═════════════════════════════════════════════════════════════════

describe('getModifierComplexity', () => {
  it('returns rows with computed complexityScore', async () => {
    mockDbRows = [
      {
        catalog_item_id: 'item-1',
        catalog_item_name: 'Build Your Own Pizza',
        distinct_modifiers: 10,
        distinct_groups: 4,
        total_selections: 200,
      },
    ];

    const result = await getModifierComplexity(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.catalogItemId).toBe('item-1');
    expect(result[0]!.catalogItemName).toBe('Build Your Own Pizza');
    expect(result[0]!.distinctModifiers).toBe(10);
    expect(result[0]!.distinctGroups).toBe(4);
    expect(result[0]!.totalSelections).toBe(200);
    expect(typeof result[0]!.complexityScore).toBe('number');
    expect(result[0]!.complexityScore).toBeGreaterThan(0);
  });

  it('computes complexity = distinctModifiers * 0.4 + avgModsPerOrder * 0.3 + distinctGroups * 0.3', async () => {
    // distinctModifiers = 10, distinctGroups = 4, totalSelections = 200
    // avgModifiersPerOrder = 200 / 10 = 20
    // complexity = 10 * 0.4 + 20 * 0.3 + 4 * 0.3 = 4 + 6 + 1.2 = 11.2
    mockDbRows = [
      {
        catalog_item_id: 'item-1',
        catalog_item_name: 'Custom Salad',
        distinct_modifiers: 10,
        distinct_groups: 4,
        total_selections: 200,
      },
    ];

    const result = await getModifierComplexity(BASE_INPUT);

    expect(result[0]!.complexityScore).toBe(11.2);
    expect(result[0]!.avgModifiersPerOrder).toBe(20);
  });

  it('returns sorted by complexityScore descending', async () => {
    // Item A: dm=2, dg=1, ts=10 => avg=5, score = 2*0.4 + 5*0.3 + 1*0.3 = 0.8 + 1.5 + 0.3 = 2.6
    // Item B: dm=8, dg=3, ts=80 => avg=10, score = 8*0.4 + 10*0.3 + 3*0.3 = 3.2 + 3.0 + 0.9 = 7.1
    mockDbRows = [
      {
        catalog_item_id: 'item-a',
        catalog_item_name: 'Simple Drink',
        distinct_modifiers: 2,
        distinct_groups: 1,
        total_selections: 10,
      },
      {
        catalog_item_id: 'item-b',
        catalog_item_name: 'Complex Bowl',
        distinct_modifiers: 8,
        distinct_groups: 3,
        total_selections: 80,
      },
    ];

    const result = await getModifierComplexity(BASE_INPUT);

    expect(result).toHaveLength(2);
    // Higher complexity first
    expect(result[0]!.catalogItemId).toBe('item-b');
    expect(result[0]!.complexityScore).toBe(7.1);
    expect(result[1]!.catalogItemId).toBe('item-a');
    expect(result[1]!.complexityScore).toBe(2.6);
  });

  it('respects limit parameter', async () => {
    mockDbRows = [
      {
        catalog_item_id: 'item-1',
        catalog_item_name: 'Item 1',
        distinct_modifiers: 10,
        distinct_groups: 5,
        total_selections: 100,
      },
      {
        catalog_item_id: 'item-2',
        catalog_item_name: 'Item 2',
        distinct_modifiers: 5,
        distinct_groups: 2,
        total_selections: 50,
      },
      {
        catalog_item_id: 'item-3',
        catalog_item_name: 'Item 3',
        distinct_modifiers: 3,
        distinct_groups: 1,
        total_selections: 30,
      },
    ];

    const result = await getModifierComplexity({ ...BASE_INPUT, limit: 2 });

    expect(result).toHaveLength(2);
  });
});
