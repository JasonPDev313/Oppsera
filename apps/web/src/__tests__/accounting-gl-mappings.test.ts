import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubDepartmentMapping } from '@/types/accounting';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  return { mockApiFetch };
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
  ApiError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ═══════════════════════════════════════════════════════════════
// Sub-department grouping logic
// ═══════════════════════════════════════════════════════════════

function groupByDepartment(mappings: SubDepartmentMapping[]) {
  const map = new Map<string, {
    departmentId: string;
    departmentName: string;
    subDepartments: SubDepartmentMapping[];
    mappedCount: number;
    totalCount: number;
  }>();

  for (const m of mappings) {
    let group = map.get(m.departmentId);
    if (!group) {
      group = {
        departmentId: m.departmentId,
        departmentName: m.departmentName,
        subDepartments: [],
        mappedCount: 0,
        totalCount: 0,
      };
      map.set(m.departmentId, group);
    }
    group.subDepartments.push(m);
    group.totalCount++;
    if (m.revenueAccountId) group.mappedCount++;
  }

  return Array.from(map.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
}

describe('sub-department grouping', () => {
  const sampleMappings: SubDepartmentMapping[] = [
    {
      subDepartmentId: 'sd-1',
      subDepartmentName: 'Apparel',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 12,
      revenueAccountId: 'acct-rev',
      revenueAccountDisplay: '4000 — Sales Revenue',
      cogsAccountId: 'acct-cogs',
      cogsAccountDisplay: '5000 — COGS',
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    },
    {
      subDepartmentId: 'sd-2',
      subDepartmentName: 'Equipment',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 5,
      revenueAccountId: null,
      revenueAccountDisplay: null,
      cogsAccountId: null,
      cogsAccountDisplay: null,
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    },
    {
      subDepartmentId: 'sd-3',
      subDepartmentName: 'Beverages',
      departmentId: 'dept-2',
      departmentName: 'Food & Bev',
      itemCount: 20,
      revenueAccountId: 'acct-rev-2',
      revenueAccountDisplay: '4100 — F&B Revenue',
      cogsAccountId: null,
      cogsAccountDisplay: null,
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    },
  ];

  it('groups sub-departments by parent department', () => {
    const groups = groupByDepartment(sampleMappings);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.departmentName).toBe('Food & Bev');
    expect(groups[1]!.departmentName).toBe('Retail');
  });

  it('counts mapped vs total correctly per department', () => {
    const groups = groupByDepartment(sampleMappings);
    const retail = groups.find((g) => g.departmentName === 'Retail')!;
    expect(retail.totalCount).toBe(2);
    expect(retail.mappedCount).toBe(1); // Only Apparel has revenueAccountId
  });

  it('sorts departments alphabetically', () => {
    const groups = groupByDepartment(sampleMappings);
    expect(groups.map((g) => g.departmentName)).toEqual(['Food & Bev', 'Retail']);
  });

  it('handles empty mappings', () => {
    const groups = groupByDepartment([]);
    expect(groups).toEqual([]);
  });

  it('detects unmapped status based on revenueAccountId', () => {
    const groups = groupByDepartment(sampleMappings);
    const retail = groups.find((g) => g.departmentName === 'Retail')!;
    const mapped = retail.subDepartments.filter((sd) => !!sd.revenueAccountId);
    const unmapped = retail.subDepartments.filter((sd) => !sd.revenueAccountId);
    expect(mapped).toHaveLength(1);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]!.subDepartmentName).toBe('Equipment');
  });
});

// ═══════════════════════════════════════════════════════════════
// Sub-department items drill-down API
// ═══════════════════════════════════════════════════════════════

describe('sub-department items API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches items for a sub-department', async () => {
    const items = [
      { id: 'item-1', sku: 'SKU-001', name: 'Golf Polo', itemType: 'retail', categoryName: 'Mens', defaultPrice: '49.99' },
      { id: 'item-2', sku: null, name: 'Club Rental', itemType: 'service', categoryName: 'Rentals', defaultPrice: '25.00' },
    ];

    mockApiFetch.mockResolvedValueOnce({ data: items, meta: { cursor: null, hasMore: false } });

    const result = await mockApiFetch('/api/v1/accounting/mappings/sub-departments/sd-1/items');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/mappings/sub-departments/sd-1/items',
    );
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(false);
  });

  it('handles paginated results', async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        sku: `SKU-${i}`,
        name: `Item ${i}`,
        itemType: 'retail',
        categoryName: 'Category',
        defaultPrice: '10.00',
      })),
      meta: { cursor: 'item-49', hasMore: true },
    });

    const result = await mockApiFetch('/api/v1/accounting/mappings/sub-departments/sd-1/items');

    expect(result.data).toHaveLength(50);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.cursor).toBe('item-49');
  });
});

// ═══════════════════════════════════════════════════════════════
// Enriched mapping data shapes
// ═══════════════════════════════════════════════════════════════

describe('enriched mapping data', () => {
  it('includes account display strings for mapped sub-departments', () => {
    const mapping: SubDepartmentMapping = {
      subDepartmentId: 'sd-1',
      subDepartmentName: 'Apparel',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 12,
      revenueAccountId: 'acct-rev',
      revenueAccountDisplay: '4000 — Sales Revenue',
      cogsAccountId: 'acct-cogs',
      cogsAccountDisplay: '5000 — Cost of Goods Sold',
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    };

    expect(mapping.revenueAccountDisplay).toBe('4000 — Sales Revenue');
    expect(mapping.cogsAccountDisplay).toBe('5000 — Cost of Goods Sold');
    expect(mapping.inventoryAssetAccountDisplay).toBeNull();
  });

  it('all display fields are null for unmapped sub-departments', () => {
    const unmapped: SubDepartmentMapping = {
      subDepartmentId: 'sd-2',
      subDepartmentName: 'Equipment',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 5,
      revenueAccountId: null,
      revenueAccountDisplay: null,
      cogsAccountId: null,
      cogsAccountDisplay: null,
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    };

    expect(unmapped.revenueAccountId).toBeNull();
    expect(unmapped.revenueAccountDisplay).toBeNull();
    expect(unmapped.cogsAccountId).toBeNull();
    expect(unmapped.cogsAccountDisplay).toBeNull();
  });

  it('includes item count for each sub-department', () => {
    const mapping: SubDepartmentMapping = {
      subDepartmentId: 'sd-1',
      subDepartmentName: 'Apparel',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 42,
      revenueAccountId: null,
      revenueAccountDisplay: null,
      cogsAccountId: null,
      cogsAccountDisplay: null,
      inventoryAssetAccountId: null,
      inventoryAssetAccountDisplay: null,
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    };

    expect(mapping.itemCount).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════
// Coverage API response shape
// ═══════════════════════════════════════════════════════════════

describe('coverage API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns coverage with totals from catalog hierarchy', async () => {
    const coverageResponse = {
      departments: { mapped: 3, total: 5 },
      paymentTypes: { mapped: 2, total: 3 },
      taxGroups: { mapped: 1, total: 2 },
      overallPercentage: 60,
    };

    mockApiFetch.mockResolvedValueOnce({ data: coverageResponse });

    const result = await mockApiFetch('/api/v1/accounting/mappings/coverage');

    expect(result.data.departments.total).toBe(5);
    expect(result.data.departments.mapped).toBe(3);
    expect(result.data.overallPercentage).toBe(60);
  });

  it('returns 100% when all entities are mapped', async () => {
    const coverageResponse = {
      departments: { mapped: 3, total: 3 },
      paymentTypes: { mapped: 2, total: 2 },
      taxGroups: { mapped: 1, total: 1 },
      overallPercentage: 100,
    };

    mockApiFetch.mockResolvedValueOnce({ data: coverageResponse });

    const result = await mockApiFetch('/api/v1/accounting/mappings/coverage');
    expect(result.data.overallPercentage).toBe(100);
  });
});
