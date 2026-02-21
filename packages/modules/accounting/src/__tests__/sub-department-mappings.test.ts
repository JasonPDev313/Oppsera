import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSubDepartmentMappings } from '../queries/get-sub-department-mappings';
import { getItemsBySubDepartment } from '../queries/get-items-by-sub-department';

const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: (...args: any[]) => mockWithTenant(...args),
  sql: vi.fn((...args: any[]) => args),
}));

describe('getSubDepartmentMappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return sub-departments with GL mappings and item counts', async () => {
    const dbRows = [
      {
        sub_department_id: 'sd-1',
        sub_department_name: 'Apparel',
        department_id: 'dept-1',
        department_name: 'Retail',
        item_count: 12,
        revenue_account_id: 'acct-rev-1',
        revenue_account_display: '4000 — Sales Revenue',
        cogs_account_id: 'acct-cogs-1',
        cogs_account_display: '5000 — Cost of Goods',
        inventory_asset_account_id: 'acct-inv-1',
        inventory_asset_account_display: '1300 — Inventory',
        discount_account_id: null,
        discount_account_display: null,
        returns_account_id: null,
        returns_account_display: null,
      },
      {
        sub_department_id: 'sd-2',
        sub_department_name: 'Beverages',
        department_id: 'dept-2',
        department_name: 'Food & Bev',
        item_count: 5,
        revenue_account_id: null,
        revenue_account_display: null,
        cogs_account_id: null,
        cogs_account_display: null,
        inventory_asset_account_id: null,
        inventory_asset_account_display: null,
        discount_account_id: null,
        discount_account_display: null,
        returns_account_id: null,
        returns_account_display: null,
      },
    ];

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getSubDepartmentMappings({ tenantId: 'tenant-1' });

    expect(result).toHaveLength(2);

    // Mapped sub-department
    expect(result[0]).toEqual({
      subDepartmentId: 'sd-1',
      subDepartmentName: 'Apparel',
      departmentId: 'dept-1',
      departmentName: 'Retail',
      itemCount: 12,
      revenueAccountId: 'acct-rev-1',
      revenueAccountDisplay: '4000 — Sales Revenue',
      cogsAccountId: 'acct-cogs-1',
      cogsAccountDisplay: '5000 — Cost of Goods',
      inventoryAssetAccountId: 'acct-inv-1',
      inventoryAssetAccountDisplay: '1300 — Inventory',
      discountAccountId: null,
      discountAccountDisplay: null,
      returnsAccountId: null,
      returnsAccountDisplay: null,
    });

    // Unmapped sub-department
    expect(result[1]).toEqual({
      subDepartmentId: 'sd-2',
      subDepartmentName: 'Beverages',
      departmentId: 'dept-2',
      departmentName: 'Food & Bev',
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
    });
  });

  it('should return empty array when no sub-departments exist', async () => {
    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getSubDepartmentMappings({ tenantId: 'tenant-1' });
    expect(result).toEqual([]);
  });

  it('should handle 2-level hierarchy (departments with direct items)', async () => {
    // When items are directly under root categories (no sub-departments),
    // the query returns root categories as both the mappable entity and the group.
    const dbRows = [
      {
        sub_department_id: 'dept-1',
        sub_department_name: 'Apparel',
        department_id: 'dept-1',       // same as sub_department_id (self-grouped)
        department_name: 'Apparel',    // same as sub_department_name
        item_count: 3,
        revenue_account_id: null,
        revenue_account_display: null,
        cogs_account_id: null,
        cogs_account_display: null,
        inventory_asset_account_id: null,
        inventory_asset_account_display: null,
        discount_account_id: null,
        discount_account_display: null,
        returns_account_id: null,
        returns_account_display: null,
      },
    ];

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getSubDepartmentMappings({ tenantId: 'tenant-1' });
    expect(result).toHaveLength(1);
    // In 2-level mode, departmentId === subDepartmentId
    expect(result[0]!.subDepartmentId).toBe('dept-1');
    expect(result[0]!.departmentId).toBe('dept-1');
    expect(result[0]!.departmentName).toBe('Apparel');
    expect(result[0]!.itemCount).toBe(3);
  });

  it('should handle zero item count for sub-departments with no items', async () => {
    const dbRows = [
      {
        sub_department_id: 'sd-empty',
        sub_department_name: 'Empty Dept',
        department_id: 'dept-1',
        department_name: 'Test',
        item_count: 0,
        revenue_account_id: null,
        revenue_account_display: null,
        cogs_account_id: null,
        cogs_account_display: null,
        inventory_asset_account_id: null,
        inventory_asset_account_display: null,
        discount_account_id: null,
        discount_account_display: null,
        returns_account_id: null,
        returns_account_display: null,
      },
    ];

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getSubDepartmentMappings({ tenantId: 'tenant-1' });
    expect(result[0]!.itemCount).toBe(0);
    expect(result[0]!.revenueAccountId).toBeNull();
  });
});

describe('getItemsBySubDepartment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return items under a sub-department with cursor pagination', async () => {
    const dbRows = [
      {
        id: 'item-1',
        sku: 'SKU-001',
        name: 'Golf Polo',
        item_type: 'retail',
        category_name: 'Mens Apparel',
        default_price: '49.99',
      },
      {
        id: 'item-2',
        sku: null,
        name: 'Pro V1 Dozen',
        item_type: 'retail',
        category_name: 'Balls',
        default_price: '59.99',
      },
    ];

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getItemsBySubDepartment({
      tenantId: 'tenant-1',
      subDepartmentId: 'sd-1',
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
    expect(result.items[0]).toEqual({
      id: 'item-1',
      sku: 'SKU-001',
      name: 'Golf Polo',
      itemType: 'retail',
      categoryName: 'Mens Apparel',
      defaultPrice: '49.99',
    });
    expect(result.items[1]!.sku).toBeNull();
  });

  it('should return hasMore=true when more items exist', async () => {
    // Default limit is 50, so 51 rows means hasMore
    const dbRows = Array.from({ length: 51 }, (_, i) => ({
      id: `item-${i}`,
      sku: `SKU-${i}`,
      name: `Item ${i}`,
      item_type: 'retail',
      category_name: 'Category',
      default_price: '10.00',
    }));

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getItemsBySubDepartment({
      tenantId: 'tenant-1',
      subDepartmentId: 'sd-1',
    });

    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('item-49');
  });

  it('should return empty items when none exist', async () => {
    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce([]) };
      return fn(mockTx);
    });

    const result = await getItemsBySubDepartment({
      tenantId: 'tenant-1',
      subDepartmentId: 'sd-nonexistent',
    });

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('should respect custom limit parameter', async () => {
    const dbRows = Array.from({ length: 6 }, (_, i) => ({
      id: `item-${i}`,
      sku: `SKU-${i}`,
      name: `Item ${i}`,
      item_type: 'retail',
      category_name: 'Category',
      default_price: '10.00',
    }));

    mockWithTenant.mockImplementation(async (_tenantId: string, fn: any) => {
      const mockTx = { execute: vi.fn().mockResolvedValueOnce(dbRows) };
      return fn(mockTx);
    });

    const result = await getItemsBySubDepartment({
      tenantId: 'tenant-1',
      subDepartmentId: 'sd-1',
      limit: 5,
    });

    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('item-4');
  });
});
