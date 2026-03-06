import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({ execute: mockExecute }),
  ),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn(), raw: vi.fn((s: string) => s) },
  ),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { RoutableItem, enrichRoutableItems as EnrichRoutableItemsFn } from '../services/kds-routing-engine';

// ── Helpers ────────────────────────────────────────────────────

function makeItem(overrides: Partial<RoutableItem> = {}): RoutableItem {
  return {
    orderLineId: 'line-1',
    catalogItemId: 'item-steak',
    departmentId: 'dept-food',
    subDepartmentId: 'subdept-entrees',
    categoryId: 'cat-steaks',
    modifierIds: [],
    ...overrides,
  };
}

interface MockCatalogRow {
  catalog_item_id: string;
  category_id: string | null;
  sub_department_id: string | null;
  department_id: string | null;
}

function makeCatalogRow(overrides: Partial<MockCatalogRow> = {}): MockCatalogRow {
  return {
    catalog_item_id: 'item-steak',
    category_id: 'cat-steaks',
    sub_department_id: 'subdept-entrees',
    department_id: 'dept-food',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('enrichRoutableItems', () => {
  let enrichRoutableItems: EnrichRoutableItemsFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get fresh module with mocks applied
    const mod = await import('../services/kds-routing-engine');
    enrichRoutableItems = mod.enrichRoutableItems;
  });

  // ── No-op Cases ────────────────────────────────────────────

  it('returns items unchanged when all fully enriched', async () => {
    const items = [
      makeItem({ catalogItemId: 'item-steak', categoryId: 'cat-steaks', subDepartmentId: 'subdept-entrees', departmentId: 'dept-food' }),
    ];

    const result = await enrichRoutableItems('tenant-1', items);

    expect(result).toEqual(items);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns items unchanged when no items provided', async () => {
    const result = await enrichRoutableItems('tenant-1', []);

    expect(result).toEqual([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  // ── Enrichment Cases ───────────────────────────────────────

  it('enriches items missing categoryId', async () => {
    const item = makeItem({ categoryId: null });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', category_id: 'cat-steaks' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result).toHaveLength(1);
    expect(result[0]!.categoryId).toBe('cat-steaks');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('enriches items missing subDepartmentId', async () => {
    const item = makeItem({ subDepartmentId: null });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', sub_department_id: 'subdept-entrees' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result).toHaveLength(1);
    expect(result[0]!.subDepartmentId).toBe('subdept-entrees');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('enriches items missing departmentId', async () => {
    const item = makeItem({ departmentId: null });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', department_id: 'dept-food' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result).toHaveLength(1);
    expect(result[0]!.departmentId).toBe('dept-food');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // ── Preservation Cases ─────────────────────────────────────

  it('preserves existing categoryId when only departmentId is missing', async () => {
    const item = makeItem({ categoryId: 'cat-steaks', subDepartmentId: 'subdept-entrees', departmentId: null });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({
        catalog_item_id: 'item-steak',
        category_id: 'cat-from-db',
        sub_department_id: 'subdept-from-db',
        department_id: 'dept-food',
      }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result[0]!.categoryId).toBe('cat-steaks');        // preserved
    expect(result[0]!.subDepartmentId).toBe('subdept-entrees'); // preserved
    expect(result[0]!.departmentId).toBe('dept-food');        // filled from DB
  });

  it('preserves existing subDepartmentId when only categoryId is missing', async () => {
    const item = makeItem({ categoryId: null, subDepartmentId: 'subdept-entrees', departmentId: 'dept-food' });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({
        catalog_item_id: 'item-steak',
        category_id: 'cat-steaks',
        sub_department_id: 'subdept-from-db',
        department_id: 'dept-from-db',
      }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result[0]!.categoryId).toBe('cat-steaks');           // filled from DB
    expect(result[0]!.subDepartmentId).toBe('subdept-entrees'); // preserved
    expect(result[0]!.departmentId).toBe('dept-food');           // preserved
  });

  // ── Not Found Cases ────────────────────────────────────────

  it('returns item unchanged when catalogItemId not found in catalog', async () => {
    const item = makeItem({ catalogItemId: 'item-ghost', categoryId: null, subDepartmentId: null, departmentId: null });
    mockExecute.mockResolvedValueOnce([]); // DB returns no rows

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result).toHaveLength(1);
    expect(result[0]!.categoryId).toBeNull();
    expect(result[0]!.subDepartmentId).toBeNull();
    expect(result[0]!.departmentId).toBeNull();
  });

  // ── Deduplication Cases ────────────────────────────────────

  it('deduplicates catalogItemIds when multiple items share the same catalogItemId', async () => {
    const items = [
      makeItem({ orderLineId: 'line-1', catalogItemId: 'item-steak', categoryId: null }),
      makeItem({ orderLineId: 'line-2', catalogItemId: 'item-steak', subDepartmentId: null }),
      makeItem({ orderLineId: 'line-3', catalogItemId: 'item-steak', departmentId: null }),
    ];
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', items);

    expect(result).toHaveLength(3);
    // Verify only one DB call was made, meaning deduplication occurred
    expect(mockExecute).toHaveBeenCalledTimes(1);
    // Verify all items were enriched from the single DB response
    expect(result[0]!.categoryId).toBe('cat-steaks');
    expect(result[1]!.subDepartmentId).toBe('subdept-entrees');
    expect(result[2]!.departmentId).toBe('dept-food');
  });

  // ── Multiple Items Cases ───────────────────────────────────

  it('enriches multiple items with different catalogItemIds', async () => {
    const items = [
      makeItem({ orderLineId: 'line-1', catalogItemId: 'item-steak', categoryId: null }),
      makeItem({ orderLineId: 'line-2', catalogItemId: 'item-caesar', categoryId: null }),
    ];
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', category_id: 'cat-steaks', sub_department_id: 'subdept-entrees', department_id: 'dept-food' }),
      makeCatalogRow({ catalog_item_id: 'item-caesar', category_id: 'cat-salads', sub_department_id: 'subdept-starters', department_id: 'dept-food' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', items);

    expect(result).toHaveLength(2);
    expect(result[0]!.categoryId).toBe('cat-steaks');
    expect(result[0]!.orderLineId).toBe('line-1');
    expect(result[1]!.categoryId).toBe('cat-salads');
    expect(result[1]!.orderLineId).toBe('line-2');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // ── Null Hierarchy Cases ───────────────────────────────────

  it('applies null sub_department_id from catalog when item is missing it', async () => {
    const item = makeItem({ subDepartmentId: undefined });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', sub_department_id: null }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result[0]!.subDepartmentId).toBeNull();
  });

  it('applies null department_id from catalog when item is missing it', async () => {
    const item = makeItem({ departmentId: undefined });
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', department_id: null }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [item]);

    expect(result[0]!.departmentId).toBeNull();
  });

  // ── Mixed Enrichment Cases ─────────────────────────────────

  it('only queries for partial items when mix of fully-enriched and partial items provided', async () => {
    const fullyEnriched = makeItem({
      orderLineId: 'line-1',
      catalogItemId: 'item-steak',
      categoryId: 'cat-steaks',
      subDepartmentId: 'subdept-entrees',
      departmentId: 'dept-food',
    });
    const partial = makeItem({
      orderLineId: 'line-2',
      catalogItemId: 'item-caesar',
      categoryId: null,
      subDepartmentId: null,
      departmentId: null,
    });

    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({
        catalog_item_id: 'item-caesar',
        category_id: 'cat-salads',
        sub_department_id: 'subdept-starters',
        department_id: 'dept-food',
      }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [fullyEnriched, partial]);

    expect(result).toHaveLength(2);

    // Fully-enriched item is unchanged
    expect(result[0]!.orderLineId).toBe('line-1');
    expect(result[0]!.categoryId).toBe('cat-steaks');
    expect(result[0]!.subDepartmentId).toBe('subdept-entrees');
    expect(result[0]!.departmentId).toBe('dept-food');

    // Partial item is enriched
    expect(result[1]!.orderLineId).toBe('line-2');
    expect(result[1]!.categoryId).toBe('cat-salads');
    expect(result[1]!.subDepartmentId).toBe('subdept-starters');
    expect(result[1]!.departmentId).toBe('dept-food');

    // Only one DB call was made (not two — the fully-enriched item's ID was excluded)
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('does not enrich the fully-enriched item — its catalog data is not overwritten', async () => {
    const fullyEnriched = makeItem({
      orderLineId: 'line-1',
      catalogItemId: 'item-steak',
      categoryId: 'original-cat',
      subDepartmentId: 'original-sub',
      departmentId: 'original-dept',
    });
    const partial = makeItem({
      orderLineId: 'line-2',
      catalogItemId: 'item-caesar',
      categoryId: null,
    });

    // DB returns rows for both IDs, with different values to catch any accidental overwrite
    mockExecute.mockResolvedValueOnce([
      makeCatalogRow({ catalog_item_id: 'item-steak', category_id: 'db-cat', sub_department_id: 'db-sub', department_id: 'db-dept' }),
      makeCatalogRow({ catalog_item_id: 'item-caesar', category_id: 'cat-salads', sub_department_id: 'subdept-starters', department_id: 'dept-food' }),
    ]);

    const result = await enrichRoutableItems('tenant-1', [fullyEnriched, partial]);

    // Fully-enriched item must keep its original values — not overwritten by DB
    expect(result[0]!.categoryId).toBe('original-cat');
    expect(result[0]!.subDepartmentId).toBe('original-sub');
    expect(result[0]!.departmentId).toBe('original-dept');

    // Partial item gets enriched from DB
    expect(result[1]!.categoryId).toBe('cat-salads');
  });
});
