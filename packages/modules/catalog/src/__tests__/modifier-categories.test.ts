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
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });

  mockSelect.mockReturnValue(makeSelectChain([]));

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  mockAuditLog.mockResolvedValue(undefined);
}

function makeSelectChain(results: unknown[] = []) {
  const p = Promise.resolve(results);
  const limitFn = vi.fn().mockResolvedValue(results);
  const orderByFn = vi.fn().mockReturnValue({
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: orderByFn,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  });
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    orderBy: orderByFn,
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
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    };
    return cb(tx);
  },
  sql: vi.fn((...args: unknown[]) => args),
  catalogModifierGroupCategories: {
    id: 'catalogModifierGroupCategories.id',
    tenantId: 'catalogModifierGroupCategories.tenantId',
    parentId: 'catalogModifierGroupCategories.parentId',
    name: 'catalogModifierGroupCategories.name',
    sortOrder: 'catalogModifierGroupCategories.sortOrder',
    createdAt: 'catalogModifierGroupCategories.createdAt',
    updatedAt: 'catalogModifierGroupCategories.updatedAt',
  },
  catalogModifierGroups: {
    id: 'catalogModifierGroups.id',
    tenantId: 'catalogModifierGroups.tenantId',
    categoryId: 'catalogModifierGroups.categoryId',
    name: 'catalogModifierGroups.name',
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
  isNull: vi.fn((...args: unknown[]) => ['isNull', ...args]),
  asc: vi.fn((...args: unknown[]) => ['asc', ...args]),
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

// ── Imports (after mocks) ────────────────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';
import { createModifierGroupCategory } from '../commands/create-modifier-group-category';
import { updateModifierGroupCategory } from '../commands/update-modifier-group-category';
import { deleteModifierGroupCategory } from '../commands/delete-modifier-group-category';
import { listModifierGroupCategories } from '../queries/list-modifier-group-categories';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    user: {
      id: USER_ID,
      email: 'test@test.com',
      name: 'Test',
      tenantId: TENANT_A,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId: TENANT_A,
    requestId: 'req_01TEST',
    isPlatformAdmin: false,
    ...overrides,
  };
}

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

function getCapturedEvents(): unknown[] {
  return ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Modifier Group Categories', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    mockTransaction.mockReset();
    setupDefaultMocks();
  });

  // ── createModifierGroupCategory ────────────────────────────────

  describe('createModifierGroupCategory', () => {
    it('creates a root-level category', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mgc_001',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Sauces',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturns(created);

      const result = await createModifierGroupCategory(ctx, {
        name: 'Sauces',
        sortOrder: 0,
      });

      expect(result.id).toBe('mgc_001');
      expect(result.name).toBe('Sauces');
      expect(result.parentId).toBeNull();
      expect(result.sortOrder).toBe(0);
    });

    it('creates a child category under an existing parent', async () => {
      const ctx = makeCtx();
      // Select: parent exists and is a root category (parentId = null)
      mockSelectReturns([
        { id: 'mgc_parent', tenantId: TENANT_A, parentId: null, name: 'Toppings', sortOrder: 0 },
      ]);
      // Insert: the child category
      const created = {
        id: 'mgc_child',
        tenantId: TENANT_A,
        parentId: 'mgc_parent',
        name: 'Pizza Toppings',
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturns(created);

      const result = await createModifierGroupCategory(ctx, {
        name: 'Pizza Toppings',
        parentId: 'mgc_parent',
        sortOrder: 1,
      });

      expect(result.id).toBe('mgc_child');
      expect(result.parentId).toBe('mgc_parent');
      expect(result.name).toBe('Pizza Toppings');
    });

    it('fails when depth exceeds 2 levels', async () => {
      const ctx = makeCtx();
      // Parent is itself a child (parentId is set), so adding a child would be depth 3
      mockSelectReturns([
        { id: 'mgc_level2', tenantId: TENANT_A, parentId: 'mgc_level1', name: 'Sub Category', sortOrder: 0 },
      ]);

      await expect(
        createModifierGroupCategory(ctx, {
          name: 'Too Deep',
          parentId: 'mgc_level2',
        }),
      ).rejects.toThrow('cannot be nested more than 2 levels deep');
    });

    it('fails when parent does not exist', async () => {
      const ctx = makeCtx();
      // Select: parent not found
      mockSelectReturns([]);

      await expect(
        createModifierGroupCategory(ctx, {
          name: 'Orphan',
          parentId: 'mgc_nonexistent',
        }),
      ).rejects.toThrow('not found');
    });

    it('emits catalog.modifier_group_category.created.v1 event', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mgc_evt',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Sides',
        sortOrder: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturns(created);

      await createModifierGroupCategory(ctx, { name: 'Sides', sortOrder: 5 });

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const evt = events[0] as Record<string, unknown>;
      expect(evt.eventType).toBe('catalog.modifier_group_category.created.v1');
      const data = evt.data as Record<string, unknown>;
      expect(data.categoryId).toBe('mgc_evt');
      expect(data.name).toBe('Sides');
      expect(data.parentId).toBeNull();

      // Verify audit log was called
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.modifier_group_category.created',
        'catalog_modifier_group_category',
        'mgc_evt',
      );
    });
  });

  // ── updateModifierGroupCategory ────────────────────────────────

  describe('updateModifierGroupCategory', () => {
    it('updates category name', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'mgc_001',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Sauces',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Select: existing category
      mockSelectReturns([existing]);
      // Update: returns updated row
      const updated = { ...existing, name: 'Dipping Sauces', updatedAt: new Date() };
      mockUpdateReturns(updated);

      const result = await updateModifierGroupCategory(ctx, 'mgc_001', {
        name: 'Dipping Sauces',
      });

      expect(result.name).toBe('Dipping Sauces');
    });

    it('re-parents a category to a different root', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'mgc_child',
        tenantId: TENANT_A,
        parentId: 'mgc_parent_old',
        name: 'Hot Sauces',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Select 1: existing category
      mockSelectReturns([existing]);
      // Select 2: new parent exists and is a root category (parentId = null)
      mockSelectReturns([
        { id: 'mgc_parent_new', tenantId: TENANT_A, parentId: null, name: 'Condiments', sortOrder: 0 },
      ]);
      // Update: returns re-parented row
      const updated = { ...existing, parentId: 'mgc_parent_new', updatedAt: new Date() };
      mockUpdateReturns(updated);

      const result = await updateModifierGroupCategory(ctx, 'mgc_child', {
        parentId: 'mgc_parent_new',
      });

      expect(result.name).toBe('Hot Sauces');
    });

    it('fails when new parent would exceed depth 2', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'mgc_001',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Root Cat',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Select 1: existing category
      mockSelectReturns([existing]);
      // Select 2: new parent is itself a child (depth would be 3)
      mockSelectReturns([
        { id: 'mgc_deep', tenantId: TENANT_A, parentId: 'mgc_some_root', name: 'Deep Parent', sortOrder: 0 },
      ]);

      await expect(
        updateModifierGroupCategory(ctx, 'mgc_001', {
          parentId: 'mgc_deep',
        }),
      ).rejects.toThrow('cannot be nested more than 2 levels deep');
    });

    it('emits catalog.modifier_group_category.updated.v1 event', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'mgc_evt_update',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Old Name',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Select: existing
      mockSelectReturns([existing]);
      // Update: returns updated
      const updated = { ...existing, name: 'New Name', sortOrder: 3, updatedAt: new Date() };
      mockUpdateReturns(updated);

      await updateModifierGroupCategory(ctx, 'mgc_evt_update', {
        name: 'New Name',
        sortOrder: 3,
      });

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const evt = events[0] as Record<string, unknown>;
      expect(evt.eventType).toBe('catalog.modifier_group_category.updated.v1');
      const data = evt.data as Record<string, unknown>;
      expect(data.categoryId).toBe('mgc_evt_update');
      expect(data.changes).toBeDefined();

      // Verify audit log was called
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.modifier_group_category.updated',
        'catalog_modifier_group_category',
        'mgc_evt_update',
        expect.anything(),
      );
    });

    it('fails when category is not found', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await expect(
        updateModifierGroupCategory(ctx, 'mgc_nonexistent', { name: 'Nope' }),
      ).rejects.toThrow('not found');
    });

    it('fails when category tries to be its own parent', async () => {
      const ctx = makeCtx();
      const existing = {
        id: 'mgc_self',
        tenantId: TENANT_A,
        parentId: null,
        name: 'Self Ref',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSelectReturns([existing]);

      await expect(
        updateModifierGroupCategory(ctx, 'mgc_self', { parentId: 'mgc_self' }),
      ).rejects.toThrow('cannot be its own parent');
    });
  });

  // ── deleteModifierGroupCategory ────────────────────────────────

  describe('deleteModifierGroupCategory', () => {
    it('deletes a category with no children and no groups', async () => {
      const ctx = makeCtx();
      // Select 1: existing category
      mockSelectReturns([
        { id: 'mgc_del', tenantId: TENANT_A, parentId: null, name: 'Deletable', sortOrder: 0 },
      ]);
      // Select 2: no child categories
      mockSelectReturns([]);
      // Select 3: no modifier groups reference it
      mockSelectReturns([]);

      await deleteModifierGroupCategory(ctx, 'mgc_del');

      expect(mockDelete).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.modifier_group_category.deleted',
        'catalog_modifier_group_category',
        'mgc_del',
      );
    });

    it('fails when category has child categories', async () => {
      const ctx = makeCtx();
      // Select 1: existing category
      mockSelectReturns([
        { id: 'mgc_parent', tenantId: TENANT_A, parentId: null, name: 'Parent', sortOrder: 0 },
      ]);
      // Select 2: has a child category
      mockSelectReturns([{ id: 'mgc_child_of_parent' }]);

      await expect(
        deleteModifierGroupCategory(ctx, 'mgc_parent'),
      ).rejects.toThrow('child categories');
    });

    it('fails when modifier groups reference it', async () => {
      const ctx = makeCtx();
      // Select 1: existing category
      mockSelectReturns([
        { id: 'mgc_referenced', tenantId: TENANT_A, parentId: null, name: 'Referenced', sortOrder: 0 },
      ]);
      // Select 2: no children
      mockSelectReturns([]);
      // Select 3: a modifier group references this category
      mockSelectReturns([{ id: 'mg_ref_001' }]);

      await expect(
        deleteModifierGroupCategory(ctx, 'mgc_referenced'),
      ).rejects.toThrow('modifier groups assigned');
    });

    it('fails when category does not exist', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await expect(
        deleteModifierGroupCategory(ctx, 'mgc_ghost'),
      ).rejects.toThrow('not found');
    });

    it('emits catalog.modifier_group_category.deleted.v1 event', async () => {
      const ctx = makeCtx();
      // Select 1: existing category
      mockSelectReturns([
        { id: 'mgc_del_evt', tenantId: TENANT_A, parentId: null, name: 'About To Delete', sortOrder: 0 },
      ]);
      // Select 2: no children
      mockSelectReturns([]);
      // Select 3: no groups
      mockSelectReturns([]);

      await deleteModifierGroupCategory(ctx, 'mgc_del_evt');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const evt = events[0] as Record<string, unknown>;
      expect(evt.eventType).toBe('catalog.modifier_group_category.deleted.v1');
      const data = evt.data as Record<string, unknown>;
      expect(data.categoryId).toBe('mgc_del_evt');
      expect(data.name).toBe('About To Delete');
    });
  });

  // ── listModifierGroupCategories ────────────────────────────────

  describe('listModifierGroupCategories', () => {
    it('returns a flat list of categories', async () => {
      const now = new Date();
      const rows = [
        { id: 'mgc_A', tenantId: TENANT_A, parentId: null, name: 'Alpha', sortOrder: 0, createdAt: now, updatedAt: now },
        { id: 'mgc_B', tenantId: TENANT_A, parentId: 'mgc_A', name: 'Beta', sortOrder: 1, createdAt: now, updatedAt: now },
        { id: 'mgc_C', tenantId: TENANT_A, parentId: null, name: 'Gamma', sortOrder: 2, createdAt: now, updatedAt: now },
      ];

      // withTenant mock calls cb(tx), and tx.select chain resolves to rows
      mockSelect.mockReturnValueOnce(makeSelectChain(rows));

      const result = await listModifierGroupCategories(TENANT_A);

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe('mgc_A');
      expect(result[0]!.parentId).toBeNull();
      expect(result[1]!.id).toBe('mgc_B');
      expect(result[1]!.parentId).toBe('mgc_A');
      expect(result[2]!.id).toBe('mgc_C');
    });

    it('returns results ordered by sortOrder then name', async () => {
      const now = new Date();
      // Pre-sorted by sortOrder asc, name asc (DB would return them this way)
      const rows = [
        { id: 'mgc_first', tenantId: TENANT_A, parentId: null, name: 'AAA', sortOrder: 0, createdAt: now, updatedAt: now },
        { id: 'mgc_second', tenantId: TENANT_A, parentId: null, name: 'BBB', sortOrder: 0, createdAt: now, updatedAt: now },
        { id: 'mgc_third', tenantId: TENANT_A, parentId: null, name: 'CCC', sortOrder: 1, createdAt: now, updatedAt: now },
      ];

      mockSelect.mockReturnValueOnce(makeSelectChain(rows));

      const result = await listModifierGroupCategories(TENANT_A);

      expect(result).toHaveLength(3);
      expect(result[0]!.name).toBe('AAA');
      expect(result[1]!.name).toBe('BBB');
      expect(result[2]!.name).toBe('CCC');
      expect(result[0]!.sortOrder).toBe(0);
      expect(result[2]!.sortOrder).toBe(1);
    });

    it('returns empty array when no categories exist', async () => {
      mockSelect.mockReturnValueOnce(makeSelectChain([]));

      const result = await listModifierGroupCategories(TENANT_A);

      expect(result).toEqual([]);
    });

    it('maps rows to ModifierGroupCategoryRow shape', async () => {
      const now = new Date();
      const rows = [
        { id: 'mgc_shape', tenantId: TENANT_A, parentId: null, name: 'Test Shape', sortOrder: 7, createdAt: now, updatedAt: now },
      ];

      mockSelect.mockReturnValueOnce(makeSelectChain(rows));

      const result = await listModifierGroupCategories(TENANT_A);

      expect(result).toHaveLength(1);
      const row = result[0]!;
      expect(row).toEqual({
        id: 'mgc_shape',
        parentId: null,
        name: 'Test Shape',
        sortOrder: 7,
        createdAt: now,
        updatedAt: now,
      });
      // Must NOT include tenantId in the mapped output
      expect((row as Record<string, unknown>).tenantId).toBeUndefined();
    });
  });
});
