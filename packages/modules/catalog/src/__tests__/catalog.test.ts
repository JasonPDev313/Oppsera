import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockExecute,
  mockInsert,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockTransaction,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock chain builders ─────────────────────────────────────────────

function setupDefaultMocks() {
  // Default insert chain: insert().values().returning() or just .values()
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });

  // Default select chain: select().from().where().limit() — also thenable without .limit()
  mockSelect.mockReturnValue(makeSelectChain([]));

  // Default update chain: update().set().where().returning()
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  // Default delete chain: delete().where()
  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  mockAuditLog.mockResolvedValue(undefined);
}

// Makes a select chain where .where() is thenable (resolves to results even without .limit())
function makeSelectChain(results: unknown[] = []) {
  const p = Promise.resolve(results);
  const limitFn = vi.fn().mockResolvedValue(results);
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  return { from: fromFn };
}

setupDefaultMocks();

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
    query: {},
  },
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: vi.fn((...args: unknown[]) => args),
  tenants: { id: 'tenants.id' },
  locations: {
    id: 'locations.id',
    tenantId: 'locations.tenantId',
    isActive: 'locations.isActive',
  },
  taxCategories: {
    id: 'taxCategories.id',
    tenantId: 'taxCategories.tenantId',
    name: 'taxCategories.name',
    rate: 'taxCategories.rate',
    isActive: 'taxCategories.isActive',
  },
  catalogCategories: {
    id: 'catalogCategories.id',
    tenantId: 'catalogCategories.tenantId',
    parentId: 'catalogCategories.parentId',
    name: 'catalogCategories.name',
    sortOrder: 'catalogCategories.sortOrder',
    isActive: 'catalogCategories.isActive',
  },
  catalogItems: {
    id: 'catalogItems.id',
    tenantId: 'catalogItems.tenantId',
    categoryId: 'catalogItems.categoryId',
    sku: 'catalogItems.sku',
    name: 'catalogItems.name',
    description: 'catalogItems.description',
    itemType: 'catalogItems.itemType',
    defaultPrice: 'catalogItems.defaultPrice',
    cost: 'catalogItems.cost',
    taxCategoryId: 'catalogItems.taxCategoryId',
    isTrackable: 'catalogItems.isTrackable',
    archivedAt: 'catalogItems.archivedAt',
    archivedBy: 'catalogItems.archivedBy',
    archivedReason: 'catalogItems.archivedReason',
    createdBy: 'catalogItems.createdBy',
    updatedBy: 'catalogItems.updatedBy',
  },
  catalogModifierGroups: {
    id: 'catalogModifierGroups.id',
    tenantId: 'catalogModifierGroups.tenantId',
    name: 'catalogModifierGroups.name',
    selectionType: 'catalogModifierGroups.selectionType',
    isRequired: 'catalogModifierGroups.isRequired',
    minSelections: 'catalogModifierGroups.minSelections',
    maxSelections: 'catalogModifierGroups.maxSelections',
  },
  catalogModifiers: {
    id: 'catalogModifiers.id',
    tenantId: 'catalogModifiers.tenantId',
    modifierGroupId: 'catalogModifiers.modifierGroupId',
    name: 'catalogModifiers.name',
    priceAdjustment: 'catalogModifiers.priceAdjustment',
    sortOrder: 'catalogModifiers.sortOrder',
    isActive: 'catalogModifiers.isActive',
  },
  catalogItemModifierGroups: {
    catalogItemId: 'catalogItemModifierGroups.catalogItemId',
    modifierGroupId: 'catalogItemModifierGroups.modifierGroupId',
  },
  catalogLocationPrices: {
    id: 'catalogLocationPrices.id',
    tenantId: 'catalogLocationPrices.tenantId',
    catalogItemId: 'catalogLocationPrices.catalogItemId',
    locationId: 'catalogLocationPrices.locationId',
    price: 'catalogLocationPrices.price',
  },
  catalogItemChangeLogs: {
    id: 'catalogItemChangeLogs.id',
    tenantId: 'catalogItemChangeLogs.tenantId',
    itemId: 'catalogItemChangeLogs.itemId',
    actionType: 'catalogItemChangeLogs.actionType',
    changedByUserId: 'catalogItemChangeLogs.changedByUserId',
    changedAt: 'catalogItemChangeLogs.changedAt',
    source: 'catalogItemChangeLogs.source',
    fieldChanges: 'catalogItemChangeLogs.fieldChanges',
    summary: 'catalogItemChangeLogs.summary',
    notes: 'catalogItemChangeLogs.notes',
  },
  eventOutbox: {
    id: 'eventOutbox.id',
    tenantId: 'eventOutbox.tenantId',
    eventType: 'eventOutbox.eventType',
    eventId: 'eventOutbox.eventId',
    idempotencyKey: 'eventOutbox.idempotencyKey',
    payload: 'eventOutbox.payload',
    occurredAt: 'eventOutbox.occurredAt',
    publishedAt: 'eventOutbox.publishedAt',
  },
  schema: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ['eq', ...args]),
  and: vi.fn((...args: unknown[]) => ['and', ...args]),
  inArray: vi.fn((...args: unknown[]) => ['inArray', ...args]),
  isNull: vi.fn((...args: unknown[]) => ['isNull', ...args]),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((str: string) => str),
  }),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
  AppError: class AppError extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number = 400,
    ) {
      super(message);
      this.name = 'AppError';
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('@oppsera/core/audit/diff', () => ({
  computeChanges: vi.fn(
    (
      oldObj: Record<string, unknown>,
      newObj: Record<string, unknown>,
      _ignore: string[] = [],
    ) => {
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of Object.keys(newObj)) {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
          changes[key] = { old: oldObj[key], new: newObj[key] };
        }
      }
      return Object.keys(changes).length > 0 ? changes : undefined;
    },
  ),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(
    async (
      _ctx: unknown,
      operation: (tx: unknown) => Promise<{ result: unknown; events: unknown[] }>,
    ) => {
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
        delete: mockDelete,
      };
      const { result, events } = await operation(tx);
      // Store captured events for assertions
      (vi as unknown as Record<string, unknown>).__capturedEvents = events;
      return result;
    },
  ),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn(
    (_ctx: unknown, eventType: string, data: unknown, idempotencyKey?: string) => ({
      eventId: 'ULID_TEST_001',
      eventType,
      occurredAt: new Date().toISOString(),
      tenantId: 'tnt_01TEST',
      data,
      idempotencyKey: idempotencyKey ?? `tnt_01TEST:${eventType}:ULID_TEST_001`,
    }),
  ),
}));

vi.mock('@oppsera/core/auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import type { RequestContext } from '@oppsera/core/auth/context';
import { createTaxCategory } from '../commands/create-tax-category';
import { createCategory } from '../commands/create-category';
import { createItem } from '../commands/create-item';
import { updateItem } from '../commands/update-item';
import { archiveItem } from '../commands/archive-item';
import { unarchiveItem } from '../commands/unarchive-item';
import { createModifierGroup } from '../commands/create-modifier-group';
import { updateModifierGroup } from '../commands/update-modifier-group';
import { setLocationPrice } from '../commands/set-location-price';
import { removeLocationPrice } from '../commands/remove-location-price';
import {
  createItemSchema,
  createModifierGroupSchema,
  setLocationPriceSchema,
} from '../validation';
import {
  CatalogItemCreatedDataSchema,
  CatalogTaxCategoryCreatedDataSchema,
  CatalogCategoryCreatedDataSchema,
  CatalogModifierGroupCreatedDataSchema,
  CatalogLocationPriceSetDataSchema,
} from '../events/types';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';
const LOCATION_A = 'loc_01TEST';
const REQUEST_ID = 'req_01TEST';

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    user: {
      id: USER_ID,
      email: 'test@test.com',
      name: 'Test User',
      tenantId: TENANT_A,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId: TENANT_A,
    requestId: REQUEST_ID,
    isPlatformAdmin: false,
    ...overrides,
  };
}

// Helper to set up select mock for a specific call
function mockSelectReturns(results: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(results));
}

function mockInsertReturns(result: unknown) {
  const returningFn = vi.fn().mockResolvedValue([result]);
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  });
  mockInsert.mockReturnValueOnce({ values: valuesFn });
}

// Insert that doesn't need .returning() (e.g., junction table inserts)
function mockInsertVoid() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

function mockUpdateReturns(result: unknown) {
  const p = Promise.resolve([result]);
  const returningFn = vi.fn().mockResolvedValue([result]);
  const whereFn = vi.fn().mockReturnValue({
    returning: returningFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockUpdate.mockReturnValueOnce({ set: setFn });
}

// Update that doesn't need .returning() (e.g., simple SET)
function mockUpdateVoid() {
  const p = Promise.resolve(undefined);
  const whereFn = vi.fn().mockReturnValue({
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockUpdate.mockReturnValueOnce({ set: setFn });
}

function getCapturedEvents(): unknown[] {
  return ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Catalog Module', () => {
  beforeEach(() => {
    // mockReset clears calls + implementations + mockReturnValueOnce queues
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    // Re-establish default chains
    setupDefaultMocks();
  });

  // ── Test 1: createTaxCategory — happy path ────────────────────

  describe('createTaxCategory', () => {
    it('creates tax category and emits event', async () => {
      const ctx = makeCtx();
      // First select: check uniqueness → empty (no conflict)
      mockSelectReturns([]);
      // Insert returning the new row
      const created = {
        id: 'tc_001',
        tenantId: TENANT_A,
        name: 'Sales Tax',
        rate: '0.0825',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturns(created);

      const result = await createTaxCategory(ctx, { name: 'Sales Tax', rate: 0.0825 });

      expect(result.id).toBe('tc_001');
      expect(result.name).toBe('Sales Tax');
      expect(result.rate).toBe('0.0825');

      // Verify event was emitted
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(
        CatalogTaxCategoryCreatedDataSchema.safeParse(eventData).success,
      ).toBe(true);

      // Verify audit log was called
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.tax_category.created',
        'tax_category',
        'tc_001',
      );
    });

    // ── Test 2: createTaxCategory — duplicate name ────────────────

    it('throws ConflictError on duplicate name', async () => {
      const ctx = makeCtx();
      // First select returns an existing row
      mockSelectReturns([{ id: 'tc_existing', name: 'Sales Tax' }]);

      await expect(
        createTaxCategory(ctx, { name: 'Sales Tax', rate: 0.0825 }),
      ).rejects.toThrow('already exists');
    });
  });

  // ── Test 3: createCategory — with parent ─────────────────────

  describe('createCategory', () => {
    it('creates category with valid parent', async () => {
      const ctx = makeCtx();
      // First select: parent exists
      mockSelectReturns([
        { id: 'cat_parent', tenantId: TENANT_A, name: 'Apparel', isActive: true },
      ]);
      // Insert
      const created = {
        id: 'cat_001',
        tenantId: TENANT_A,
        name: "Men's Apparel",
        parentId: 'cat_parent',
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturns(created);

      const result = await createCategory(ctx, {
        name: "Men's Apparel",
        parentId: 'cat_parent',
        sortOrder: 0,
      });

      expect(result.id).toBe('cat_001');
      expect(result.parentId).toBe('cat_parent');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect(
        CatalogCategoryCreatedDataSchema.safeParse(
          (events[0] as Record<string, unknown>).data,
        ).success,
      ).toBe(true);
    });

    // ── Test 4: createCategory — invalid parent ──────────────────

    it('throws NotFoundError for nonexistent parent', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await expect(
        createCategory(ctx, {
          name: 'Orphan',
          parentId: 'cat_nonexistent',
          sortOrder: 0,
        }),
      ).rejects.toThrow('not found');
    });
  });

  // ── Test 5: createItem — full item ─────────────────────────────

  describe('createItem', () => {
    it('creates item with all fields and modifier groups', async () => {
      const ctx = makeCtx();

      // Select 1: category exists
      mockSelectReturns([{ id: 'cat_001', tenantId: TENANT_A }]);
      // Select 2: tax category exists
      mockSelectReturns([{ id: 'tc_001', tenantId: TENANT_A }]);
      // Select 3: sku uniqueness check → empty
      mockSelectReturns([]);
      // Select 4: modifier groups exist
      mockSelectReturns([
        { id: 'mg_001', tenantId: TENANT_A },
      ]);

      // Insert item
      const createdItem = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-BLU-L',
        name: 'Blue Polo Shirt (L)',
        description: 'A fine polo',
        itemType: 'retail',
        defaultPrice: '49.99',
        cost: '25.00',
        categoryId: 'cat_001',
        taxCategoryId: 'tc_001',
        isTrackable: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(createdItem);

      // Insert junction rows (no returning needed)
      mockInsertVoid();

      const result = await createItem(ctx, {
        sku: 'POLO-BLU-L',
        name: 'Blue Polo Shirt (L)',
        description: 'A fine polo',
        itemType: 'retail',
        defaultPrice: 49.99,
        cost: 25.0,
        categoryId: 'cat_001',
        taxCategoryId: 'tc_001',
        priceIncludesTax: false,
        isTrackable: true,
        modifierGroupIds: ['mg_001'],
      });

      expect(result.id).toBe('item_001');
      expect(result.sku).toBe('POLO-BLU-L');
      expect(result.isTrackable).toBe(true);

      // Verify event data matches schema
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(CatalogItemCreatedDataSchema.safeParse(eventData).success).toBe(true);

      // Verify audit
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.item.created',
        'catalog_item',
        'item_001',
      );
    });

    // ── Test 6: createItem — minimal item ──────────────────────────

    it('creates item with only required fields', async () => {
      const ctx = makeCtx();
      // No reference checks needed (no categoryId, taxCategoryId, sku, modifierGroupIds)
      const createdItem = {
        id: 'item_minimal',
        tenantId: TENANT_A,
        sku: null,
        name: 'Simple Widget',
        description: null,
        itemType: 'retail',
        defaultPrice: '9.99',
        cost: null,
        categoryId: null,
        taxCategoryId: null,
        isTrackable: false,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(createdItem);

      const result = await createItem(ctx, {
        name: 'Simple Widget',
        itemType: 'retail',
        defaultPrice: 9.99,
        priceIncludesTax: false,
        isTrackable: false,
        modifierGroupIds: [],
      });

      expect(result.id).toBe('item_minimal');
      expect(result.sku).toBeNull();
      expect(result.categoryId).toBeNull();
      expect(result.isTrackable).toBe(false);
    });

    // ── Test 7: createItem — duplicate SKU ─────────────────────────

    it('throws ConflictError on duplicate SKU within tenant', async () => {
      const ctx = makeCtx();
      // SKU check returns existing
      mockSelectReturns([{ id: 'item_existing', sku: 'POLO-001' }]);

      await expect(
        createItem(ctx, {
          sku: 'POLO-001',
          name: 'Duplicate SKU Item',
          itemType: 'retail',
          defaultPrice: 29.99,
          priceIncludesTax: false,
          isTrackable: false,
          modifierGroupIds: [],
        }),
      ).rejects.toThrow('already exists');
    });

    // ── Test 8: createItem — invalid references ───────────────────

    it('throws NotFoundError for invalid categoryId', async () => {
      const ctx = makeCtx();
      // Category not found
      mockSelectReturns([]);

      await expect(
        createItem(ctx, {
          name: 'Bad Category Item',
          itemType: 'retail',
          defaultPrice: 19.99,
          priceIncludesTax: false,
          isTrackable: false,
          categoryId: 'cat_nonexistent',
          modifierGroupIds: [],
        }),
      ).rejects.toThrow('not found');
    });

    it('throws NotFoundError for invalid taxCategoryId', async () => {
      const ctx = makeCtx();
      // No categoryId, so skip that check
      // Tax category not found
      mockSelectReturns([]);

      await expect(
        createItem(ctx, {
          name: 'Bad Tax Item',
          itemType: 'retail',
          defaultPrice: 19.99,
          priceIncludesTax: false,
          isTrackable: false,
          taxCategoryId: 'tc_nonexistent',
          modifierGroupIds: [],
        }),
      ).rejects.toThrow('not found');
    });

    it('throws NotFoundError for invalid modifierGroupId', async () => {
      const ctx = makeCtx();
      // Modifier groups: returns fewer than requested
      mockSelectReturns([]);

      await expect(
        createItem(ctx, {
          name: 'Bad Modifier Item',
          itemType: 'retail',
          defaultPrice: 19.99,
          priceIncludesTax: false,
          isTrackable: false,
          modifierGroupIds: ['mg_nonexistent'],
        }),
      ).rejects.toThrow('not found');
    });
  });

  // ── Test 9: updateItem — partial update ─────────────────────────

  describe('updateItem', () => {
    it('partially updates item and tracks changes', async () => {
      const ctx = makeCtx();
      // Fetch existing item
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-001',
        name: 'Blue Polo',
        description: null,
        itemType: 'retail',
        defaultPrice: '49.99',
        cost: null,
        categoryId: null,
        taxCategoryId: null,
        isTrackable: false,
        archivedAt: null,
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockSelectReturns([existing]);

      // Update returns new values
      const updated = {
        ...existing,
        defaultPrice: '54.99',
        updatedBy: USER_ID,
      };
      mockUpdateReturns(updated);

      const result = await updateItem(ctx, 'item_001', { defaultPrice: 54.99 });

      expect(result.defaultPrice).toBe('54.99');

      // Verify event with changes
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data as Record<
        string,
        unknown
      >;
      expect(eventData.itemId).toBe('item_001');
      expect(eventData.changes).toBeDefined();

      // Verify audit
      expect(mockAuditLog).toHaveBeenCalled();
    });

    // ── Test 10: updateItem — replace modifier groups ──────────────

    it('replaces modifier groups when modifierGroupIds provided', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: null,
        name: 'Test Item',
        description: null,
        itemType: 'retail',
        defaultPrice: '49.99',
        cost: null,
        categoryId: null,
        taxCategoryId: null,
        isTrackable: false,
        archivedAt: null,
        createdBy: USER_ID,
        updatedBy: null,
      };
      // Select 1: fetch existing item
      mockSelectReturns([existing]);
      // Select 2: validate modifier groups exist
      mockSelectReturns([
        { id: 'mg_B', tenantId: TENANT_A },
        { id: 'mg_C', tenantId: TENANT_A },
      ]);
      // Update: returns the updated item
      mockUpdateReturns({ ...existing, updatedBy: USER_ID });
      // Delete old junction rows
      mockDelete.mockReturnValueOnce({
        where: vi.fn().mockResolvedValue(undefined),
      });
      // Insert new junction rows
      mockInsertVoid();

      await updateItem(ctx, 'item_001', {
        modifierGroupIds: ['mg_B', 'mg_C'],
      });

      // Verify delete was called (for old junction rows)
      expect(mockDelete).toHaveBeenCalled();
    });

    it('throws AppError when updating inactive item', async () => {
      const ctx = makeCtx();
      const inactive = {
        id: 'item_001',
        tenantId: TENANT_A,
        archivedAt: new Date(),
      };
      mockSelectReturns([inactive]);

      await expect(
        updateItem(ctx, 'item_001', { name: 'New Name' }),
      ).rejects.toThrow('Cannot update an inactive item');
    });
  });

  // ── Test 11: archiveItem ──────────────────────────────────────

  describe('archiveItem', () => {
    it('archives active item and emits event', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-001',
        name: 'Blue Polo',
        archivedAt: null,
      };
      // Select: fetch existing item
      mockSelectReturns([existing]);
      // Update: set archivedAt
      const archived = { ...existing, archivedAt: new Date(), archivedBy: USER_ID, archivedReason: null };
      mockUpdateReturns(archived);

      const result = await archiveItem(ctx, 'item_001', {});

      expect(result.archivedAt).toBeTruthy();

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as Record<string, unknown>).eventType).toBe(
        'catalog.item.archived.v1',
      );
    });

    // ── Test 12: archiveItem — idempotent ────────────────────────

    it('returns item as-is when already archived', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-001',
        name: 'Blue Polo',
        archivedAt: new Date(),
      };
      mockSelectReturns([existing]);

      const result = await archiveItem(ctx, 'item_001', {});

      expect(result.archivedAt).toBeTruthy();
      // No update should have been called
      expect(mockUpdate).not.toHaveBeenCalled();

      // No events emitted for already-archived
      const events = getCapturedEvents();
      expect(events).toHaveLength(0);
    });

    it('throws NotFoundError for nonexistent item', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await expect(archiveItem(ctx, 'item_nonexistent', {})).rejects.toThrow(
        'not found',
      );
    });
  });

  // ── Test 11b: unarchiveItem ──────────────────────────────────────

  describe('unarchiveItem', () => {
    it('unarchives inactive item and emits event', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-001',
        name: 'Blue Polo',
        archivedAt: new Date(),
      };
      // Select: fetch existing item
      mockSelectReturns([existing]);
      // Update: clear archivedAt
      const unarchived = { ...existing, archivedAt: null, archivedBy: null, archivedReason: null };
      mockUpdateReturns(unarchived);

      const result = await unarchiveItem(ctx, 'item_001');

      expect(result.archivedAt).toBeNull();

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as Record<string, unknown>).eventType).toBe(
        'catalog.item.unarchived.v1',
      );
    });

    it('returns item as-is when already active', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'item_001',
        tenantId: TENANT_A,
        sku: 'POLO-001',
        name: 'Blue Polo',
        archivedAt: null,
      };
      mockSelectReturns([existing]);

      const result = await unarchiveItem(ctx, 'item_001');

      expect(result.archivedAt).toBeFalsy();
      expect(mockUpdate).not.toHaveBeenCalled();

      const events = getCapturedEvents();
      expect(events).toHaveLength(0);
    });
  });

  // ── Test 13: createModifierGroup ──────────────────────────────────

  describe('createModifierGroup', () => {
    it('creates group with modifiers and emits event', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_001',
        tenantId: TENANT_A,
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Insert 1: modifier group (needs .returning())
      mockInsertReturns(created);
      // Insert 2: modifiers (no returning)
      mockInsertVoid();

      const result = await createModifierGroup(ctx, {
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        modifiers: [
          { name: 'Small', priceAdjustment: 0, sortOrder: 0 },
          { name: 'Medium', priceAdjustment: 0, sortOrder: 1 },
          { name: 'Large', priceAdjustment: 2.0, sortOrder: 2 },
        ],
      });

      expect(result.id).toBe('mg_001');
      expect(result.name).toBe('Size');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(
        CatalogModifierGroupCreatedDataSchema.safeParse(eventData).success,
      ).toBe(true);
      expect((eventData as Record<string, unknown>).modifierCount).toBe(3);
    });
  });

  // ── Test 14: setLocationPrice ─────────────────────────────────────

  describe('setLocationPrice', () => {
    it('creates location-specific price override', async () => {
      const ctx = makeCtx();
      // Select 1: item exists
      mockSelectReturns([{ id: 'item_001', tenantId: TENANT_A }]);
      // Select 2: location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A, isActive: true }]);
      // Select 3: no existing override
      mockSelectReturns([]);
      // Insert: new location price
      const created = {
        id: 'lp_001',
        tenantId: TENANT_A,
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        price: '39.99',
      };
      mockInsertReturns(created);

      const result = await setLocationPrice(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        price: 39.99,
      });

      expect(result.price).toBe('39.99');
      expect(result.catalogItemId).toBe('item_001');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data as Record<
        string,
        unknown
      >;
      expect(eventData.previousPrice).toBeNull();
      expect(eventData.price).toBe(39.99);
    });

    // ── Test 15: setLocationPrice — upsert ──────────────────────────

    it('updates existing price override (upsert)', async () => {
      const ctx = makeCtx();
      // Select 1: item exists
      mockSelectReturns([{ id: 'item_001', tenantId: TENANT_A }]);
      // Select 2: location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A, isActive: true }]);
      // Select 3: existing override found
      mockSelectReturns([
        { id: 'lp_001', catalogItemId: 'item_001', locationId: LOCATION_A, price: '39.99' },
      ]);
      // Update: update existing price
      mockUpdateReturns({
        id: 'lp_001',
        tenantId: TENANT_A,
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        price: '44.99',
      });

      const result = await setLocationPrice(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        price: 44.99,
      });

      expect(result.price).toBe('44.99');

      const events = getCapturedEvents();
      const eventData = (events[0] as Record<string, unknown>).data as Record<
        string,
        unknown
      >;
      expect(eventData.previousPrice).toBe(39.99);
      expect(eventData.price).toBe(44.99);
    });
  });

  // ── Test 16: removeLocationPrice ──────────────────────────────────

  describe('removeLocationPrice', () => {
    it('removes existing price override', async () => {
      const ctx = makeCtx();
      // Existing override found
      mockSelectReturns([
        {
          id: 'lp_001',
          catalogItemId: 'item_001',
          locationId: LOCATION_A,
          tenantId: TENANT_A,
        },
      ]);

      await removeLocationPrice(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.location_price.removed',
        'catalog_location_price',
        'item_001:loc_01TEST',
      );
    });

    it('is idempotent when override does not exist', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await removeLocationPrice(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
      });

      // No delete called
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  // ── Test 17: updateModifierGroup ──────────────────────────────────

  describe('updateModifierGroup', () => {
    it('updates group and handles modifier additions/deactivations', async () => {
      const ctx = makeCtx();
      // Select 1: fetch existing group
      mockSelectReturns([
        { id: 'mg_001', tenantId: TENANT_A, name: 'Size', selectionType: 'single' },
      ]);
      // Update 1: update group fields
      mockUpdateReturns({
        id: 'mg_001',
        tenantId: TENANT_A,
        name: 'Sizes',
        selectionType: 'single',
      });
      // Select 2: fetch existing modifiers
      mockSelectReturns([
        { id: 'mod_A', modifierGroupId: 'mg_001', name: 'Small' },
        { id: 'mod_B', modifierGroupId: 'mg_001', name: 'Medium' },
      ]);
      // Update 2: deactivate mod_A (not in new list)
      mockUpdateVoid();
      // Update 3: update existing mod_B
      mockUpdateVoid();
      // Insert: new modifier (no returning needed for modifiers)
      mockInsertVoid();

      const result = await updateModifierGroup(ctx, 'mg_001', {
        name: 'Sizes',
        modifiers: [
          { id: 'mod_B', name: 'Medium', priceAdjustment: 0, sortOrder: 0, isActive: true },
          { name: 'Large', priceAdjustment: 2.0, sortOrder: 1, isActive: true },
        ],
      });

      expect(result.name).toBe('Sizes');
      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // ── Test 18: publishWithOutbox atomicity ──────────────────────────

  describe('publishWithOutbox atomicity', () => {
    it('rolls back when operation throws', async () => {
      const ctx = makeCtx();
      // Select: uniqueness check returns existing → ConflictError thrown
      mockSelectReturns([{ id: 'tc_existing', name: 'Dup Tax' }]);

      await expect(
        createTaxCategory(ctx, { name: 'Dup Tax', rate: 0.05 }),
      ).rejects.toThrow('already exists');

      // No audit log written when transaction fails
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // ── Test 19: Validation schemas ────────────────────────────────────

  describe('Validation schemas', () => {
    it('createItemSchema validates correctly', () => {
      const valid = createItemSchema.safeParse({
        name: 'Test Item',
        itemType: 'retail',
        defaultPrice: 9.99,
      });
      expect(valid.success).toBe(true);

      const invalid = createItemSchema.safeParse({
        name: '',
        itemType: 'invalid_type',
        defaultPrice: -1,
      });
      expect(invalid.success).toBe(false);
    });

    it('createModifierGroupSchema enforces selection constraints', () => {
      const invalidRequired = createModifierGroupSchema.safeParse({
        name: 'Bad Group',
        isRequired: true,
        minSelections: 0,
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalidRequired.success).toBe(false);

      const invalidRange = createModifierGroupSchema.safeParse({
        name: 'Bad Range',
        minSelections: 5,
        maxSelections: 2,
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalidRange.success).toBe(false);

      const valid = createModifierGroupSchema.safeParse({
        name: 'Good Group',
        isRequired: true,
        minSelections: 1,
        maxSelections: 3,
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(valid.success).toBe(true);
    });

    it('setLocationPriceSchema validates correctly', () => {
      const valid = setLocationPriceSchema.safeParse({
        catalogItemId: 'item_001',
        locationId: 'loc_001',
        price: 39.99,
      });
      expect(valid.success).toBe(true);

      const invalidPrice = setLocationPriceSchema.safeParse({
        catalogItemId: 'item_001',
        locationId: 'loc_001',
        price: -5,
      });
      expect(invalidPrice.success).toBe(false);
    });
  });

  // ── Test 20: Event contract schemas validate ────────────────────

  describe('Event contract schemas', () => {
    it('CatalogItemCreatedDataSchema validates event data', () => {
      const validData = {
        itemId: 'item_001',
        sku: 'POLO-001',
        name: 'Blue Polo',
        itemType: 'retail',
        defaultPrice: 49.99,
        cost: null,
        categoryId: null,
        taxCategoryId: null,
        isTrackable: true,
      };
      expect(CatalogItemCreatedDataSchema.safeParse(validData).success).toBe(true);

      const invalidData = { itemId: 123 };
      expect(CatalogItemCreatedDataSchema.safeParse(invalidData).success).toBe(false);
    });

    it('CatalogLocationPriceSetDataSchema validates event data', () => {
      const validData = {
        catalogItemId: 'item_001',
        locationId: 'loc_001',
        price: 39.99,
        previousPrice: null,
      };
      expect(CatalogLocationPriceSetDataSchema.safeParse(validData).success).toBe(
        true,
      );

      const withPrevious = {
        catalogItemId: 'item_001',
        locationId: 'loc_001',
        price: 44.99,
        previousPrice: 39.99,
      };
      expect(CatalogLocationPriceSetDataSchema.safeParse(withPrevious).success).toBe(
        true,
      );
    });
  });
});
