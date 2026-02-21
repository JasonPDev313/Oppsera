import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRevenueAccountForSubDepartment, expandPackageForGL } from '../helpers/catalog-gl-resolution';

vi.mock('@oppsera/db', () => ({
  db: {},
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('../helpers/resolve-mapping', () => ({
  resolveSubDepartmentAccounts: vi.fn(),
}));

import { resolveSubDepartmentAccounts } from '../helpers/resolve-mapping';
const mockedResolve = vi.mocked(resolveSubDepartmentAccounts);

describe('resolveRevenueAccountForSubDepartment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return revenue account ID when mapping exists', async () => {
    mockedResolve.mockResolvedValueOnce({
      subDepartmentId: 'subdept-1',
      revenueAccountId: 'acct-rev-100',
      cogsAccountId: 'acct-cogs-200',
      inventoryAccountId: 'acct-inv-300',
    });

    const result = await resolveRevenueAccountForSubDepartment({} as any, 'tenant-1', 'subdept-1');

    expect(result).toBe('acct-rev-100');
    expect(mockedResolve).toHaveBeenCalledWith({}, 'tenant-1', 'subdept-1');
  });

  it('should return null when no mapping exists', async () => {
    mockedResolve.mockResolvedValueOnce(null);

    const result = await resolveRevenueAccountForSubDepartment({} as any, 'tenant-1', 'subdept-missing');

    expect(result).toBeNull();
  });
});

describe('expandPackageForGL', () => {
  it('should return single entry for regular item', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-1',
      extendedPriceCents: 1500,
      packageComponents: null,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subDepartmentId: 'subdept-1',
      revenueCents: 1500,
    });
  });

  it('should return single entry for item with empty packageComponents', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-1',
      extendedPriceCents: 1500,
      packageComponents: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subDepartmentId: 'subdept-1',
      revenueCents: 1500,
    });
  });

  it('should return single entry for legacy package without allocatedRevenueCents', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-1',
      extendedPriceCents: 3000,
      packageComponents: [
        { subDepartmentId: 'subdept-a', allocatedRevenueCents: undefined as any },
        { subDepartmentId: 'subdept-b', allocatedRevenueCents: undefined as any },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subDepartmentId: 'subdept-1',
      revenueCents: 3000,
    });
  });

  it('should split revenue across component subdepartments for enriched packages', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-package',
      extendedPriceCents: 3000,
      packageComponents: [
        { subDepartmentId: 'subdept-food', allocatedRevenueCents: 2000 },
        { subDepartmentId: 'subdept-bev', allocatedRevenueCents: 1000 },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ subDepartmentId: 'subdept-food', revenueCents: 2000 });
    expect(result[1]).toEqual({ subDepartmentId: 'subdept-bev', revenueCents: 1000 });
  });

  it('should handle package components with null subdepartment', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-package',
      extendedPriceCents: 2000,
      packageComponents: [
        { subDepartmentId: null, allocatedRevenueCents: 1200 },
        { subDepartmentId: 'subdept-drinks', allocatedRevenueCents: 800 },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ subDepartmentId: null, revenueCents: 1200 });
    expect(result[1]).toEqual({ subDepartmentId: 'subdept-drinks', revenueCents: 800 });
  });

  it('should handle single-component package', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-package',
      extendedPriceCents: 1500,
      packageComponents: [
        { subDepartmentId: 'subdept-only', allocatedRevenueCents: 1500 },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ subDepartmentId: 'subdept-only', revenueCents: 1500 });
  });

  it('should preserve zero-cent allocations', () => {
    const result = expandPackageForGL({
      subDepartmentId: 'subdept-package',
      extendedPriceCents: 1000,
      packageComponents: [
        { subDepartmentId: 'subdept-a', allocatedRevenueCents: 1000 },
        { subDepartmentId: 'subdept-b', allocatedRevenueCents: 0 },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[1]!.revenueCents).toBe(0);
  });
});
