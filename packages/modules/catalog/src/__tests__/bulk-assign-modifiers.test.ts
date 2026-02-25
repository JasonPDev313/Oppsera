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
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
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
  catalogItems: {
    id: 'catalogItems.id',
    tenantId: 'catalogItems.tenantId',
    categoryId: 'catalogItems.categoryId',
    sku: 'catalogItems.sku',
    name: 'catalogItems.name',
    itemType: 'catalogItems.itemType',
    defaultPrice: 'catalogItems.defaultPrice',
    archivedAt: 'catalogItems.archivedAt',
  },
  catalogModifierGroups: {
    id: 'catalogModifierGroups.id',
    tenantId: 'catalogModifierGroups.tenantId',
    name: 'catalogModifierGroups.name',
  },
  catalogItemModifierGroups: {
    catalogItemId: 'catalogItemModifierGroups.catalogItemId',
    modifierGroupId: 'catalogItemModifierGroups.modifierGroupId',
    isDefault: 'catalogItemModifierGroups.isDefault',
    overrideRequired: 'catalogItemModifierGroups.overrideRequired',
    overrideMinSelections: 'catalogItemModifierGroups.overrideMinSelections',
    overrideMaxSelections: 'catalogItemModifierGroups.overrideMaxSelections',
    overrideInstructionMode: 'catalogItemModifierGroups.overrideInstructionMode',
    promptOrder: 'catalogItemModifierGroups.promptOrder',
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
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
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

import type { RequestContext } from '@oppsera/core/auth/context';
import { bulkAssignModifierGroups } from '../commands/bulk-assign-modifier-groups';
import { updateItemModifierAssignment } from '../commands/update-item-modifier-assignment';
import { removeItemModifierAssignment } from '../commands/remove-item-modifier-assignment';
import { bulkAssignModifierGroupsSchema, updateItemModifierAssignmentSchema } from '../validation';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';

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
    requestId: 'req_01TEST',
    isPlatformAdmin: false,
    ...overrides,
  };
}

function mockSelectReturns(results: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(results));
}

function mockInsertWithConflict(returnedRows: unknown[]) {
  const returningFn = vi.fn().mockResolvedValue(returnedRows);
  const onConflictDoNothingFn = vi.fn().mockReturnValue({
    returning: returningFn,
  });
  const valuesFn = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(returnedRows),
    onConflictDoNothing: onConflictDoNothingFn,
  });
  mockInsert.mockReturnValueOnce({ values: valuesFn });
}

function mockInsertBulk() {
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  mockInsert.mockReturnValueOnce({ values: valuesFn });
}

function mockDeleteVoid() {
  mockDelete.mockReturnValueOnce({
    where: vi.fn().mockResolvedValue(undefined),
  });
}

function mockUpdateReturns(result: unknown) {
  const returningFn = vi.fn().mockResolvedValue([result]);
  const whereFn = vi.fn().mockReturnValue({
    returning: returningFn,
  });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockUpdate.mockReturnValueOnce({ set: setFn });
}

function getCapturedEvents(): unknown[] {
  return ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Bulk Modifier Group Assignment', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    setupDefaultMocks();
  });

  // ────────────────────────────────────────────────────────────────
  // bulkAssignModifierGroups
  // ────────────────────────────────────────────────────────────────

  describe('bulkAssignModifierGroups', () => {
    // Test 1: Merge mode assigns groups to items
    it('merge mode: assigns groups to items', async () => {
      const ctx = makeCtx();

      // Select 1: validate items exist
      mockSelectReturns([{ id: 'item_001' }, { id: 'item_002' }]);
      // Select 2: validate modifier groups exist
      mockSelectReturns([{ id: 'mg_001' }]);

      // 2 items x 1 group = 2 inserts with ON CONFLICT DO NOTHING
      // Each returns a row (new assignment, not skipped)
      mockInsertWithConflict([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      mockInsertWithConflict([{ catalogItemId: 'item_002', modifierGroupId: 'mg_001' }]);

      const result = await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001', 'item_002'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
      });

      expect(result.assignedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
    });

    // Test 2: Merge mode skips duplicates (ON CONFLICT DO NOTHING)
    it('merge mode: skips duplicates via ON CONFLICT DO NOTHING', async () => {
      const ctx = makeCtx();

      // Select 1: items exist
      mockSelectReturns([{ id: 'item_001' }]);
      // Select 2: groups exist
      mockSelectReturns([{ id: 'mg_001' }, { id: 'mg_002' }]);

      // First insert returns a row (new assignment)
      mockInsertWithConflict([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      // Second insert returns empty (duplicate, skipped)
      mockInsertWithConflict([]);

      const result = await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001', 'mg_002'],
        mode: 'merge',
      });

      expect(result.assignedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });

    // Test 3: Replace mode deletes existing assignments then inserts new ones
    it('replace mode: deletes existing then inserts new', async () => {
      const ctx = makeCtx();

      // Select 1: items exist
      mockSelectReturns([{ id: 'item_001' }, { id: 'item_002' }]);
      // Select 2: groups exist
      mockSelectReturns([{ id: 'mg_001' }]);

      // Delete existing assignments for the group (1 group = 1 delete call)
      mockDeleteVoid();
      // Bulk insert all rows
      mockInsertBulk();

      const result = await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001', 'item_002'],
        modifierGroupIds: ['mg_001'],
        mode: 'replace',
      });

      // 2 items x 1 group = 2 assigned
      expect(result.assignedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      // Delete was called
      expect(mockDelete).toHaveBeenCalled();
    });

    // Test 4: Merge mode with overrides
    it('merge mode: applies overrides to assignment rows', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);

      // Check that insert receives the override values
      const capturedValues: unknown[] = [];
      const returningFn = vi.fn().mockResolvedValue([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      const onConflictDoNothingFn = vi.fn().mockReturnValue({ returning: returningFn });
      const valuesFn = vi.fn().mockImplementation((val: unknown) => {
        capturedValues.push(val);
        return {
          returning: vi.fn().mockResolvedValue([val]),
          onConflictDoNothing: onConflictDoNothingFn,
        };
      });
      mockInsert.mockReturnValueOnce({ values: valuesFn });

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
        overrides: {
          isDefault: true,
          overrideRequired: true,
          overrideMinSelections: 1,
          overrideMaxSelections: 3,
          overrideInstructionMode: 'per_option',
          promptOrder: 5,
        },
      });

      expect(capturedValues.length).toBe(1);
      const row = capturedValues[0] as Record<string, unknown>;
      expect(row.isDefault).toBe(true);
      expect(row.overrideRequired).toBe(true);
      expect(row.overrideMinSelections).toBe(1);
      expect(row.overrideMaxSelections).toBe(3);
      expect(row.overrideInstructionMode).toBe('per_option');
      expect(row.promptOrder).toBe(5);
    });

    // Test 5: Replace mode with overrides
    it('replace mode: applies overrides to assignment rows', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);

      // Delete
      mockDeleteVoid();

      // Capture the values passed to insert
      const capturedValues: unknown[] = [];
      const valuesFn = vi.fn().mockImplementation((val: unknown) => {
        capturedValues.push(val);
        return Promise.resolve(undefined);
      });
      mockInsert.mockReturnValueOnce({ values: valuesFn });

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'replace',
        overrides: {
          overrideRequired: false,
          overrideMinSelections: 0,
          overrideMaxSelections: 5,
        },
      });

      expect(capturedValues.length).toBe(1);
      const rows = capturedValues[0] as Array<Record<string, unknown>>;
      expect(rows[0]!.overrideRequired).toBe(false);
      expect(rows[0]!.overrideMinSelections).toBe(0);
      expect(rows[0]!.overrideMaxSelections).toBe(5);
    });

    // Test 6: Validation rejects > 500 items
    it('validation: rejects more than 500 items', () => {
      const itemIds = Array.from({ length: 501 }, (_, i) => `item_${i}`);
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds,
        modifierGroupIds: ['mg_001'],
      });
      expect(parsed.success).toBe(false);
    });

    // Test 7: Validation rejects > 20 groups
    it('validation: rejects more than 20 modifier groups', () => {
      const modifierGroupIds = Array.from({ length: 21 }, (_, i) => `mg_${i}`);
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds,
      });
      expect(parsed.success).toBe(false);
    });

    // Test 8: Validation rejects empty itemIds
    it('validation: rejects empty itemIds array', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: [],
        modifierGroupIds: ['mg_001'],
      });
      expect(parsed.success).toBe(false);
    });

    // Test 9: Validation rejects empty modifierGroupIds
    it('validation: rejects empty modifierGroupIds array', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds: [],
      });
      expect(parsed.success).toBe(false);
    });

    // Test 10: Emits correct event with item/group counts
    it('emits catalog.modifier_groups.bulk_assigned.v1 with correct counts', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }, { id: 'item_002' }, { id: 'item_003' }]);
      mockSelectReturns([{ id: 'mg_001' }, { id: 'mg_002' }]);

      // 3 items x 2 groups = 6 inserts in merge mode
      for (let i = 0; i < 6; i++) {
        mockInsertWithConflict([{ catalogItemId: `item_xxx`, modifierGroupId: `mg_xxx` }]);
      }

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001', 'item_002', 'item_003'],
        modifierGroupIds: ['mg_001', 'mg_002'],
        mode: 'merge',
      });

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event.eventType).toBe('catalog.modifier_groups.bulk_assigned.v1');
      const data = event.data as Record<string, unknown>;
      expect(data.itemCount).toBe(3);
      expect(data.groupCount).toBe(2);
      expect(data.assignedCount).toBe(6);
      expect(data.skippedCount).toBe(0);
      expect(data.mode).toBe('merge');
    });

    // Test 16: Merge mode returns correct assignedCount/skippedCount
    it('merge mode: returns accurate assigned and skipped counts', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }, { id: 'item_002' }]);
      mockSelectReturns([{ id: 'mg_001' }, { id: 'mg_002' }]);

      // 2 items x 2 groups = 4 inserts
      // Simulate: 2 new, 2 skipped
      mockInsertWithConflict([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]); // new
      mockInsertWithConflict([]); // skipped
      mockInsertWithConflict([{ catalogItemId: 'item_002', modifierGroupId: 'mg_001' }]); // new
      mockInsertWithConflict([]); // skipped

      const result = await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001', 'item_002'],
        modifierGroupIds: ['mg_001', 'mg_002'],
        mode: 'merge',
      });

      expect(result.assignedCount).toBe(2);
      expect(result.skippedCount).toBe(2);
    });

    // Test 17: Replace mode returns correct assignedCount
    it('replace mode: returns correct assignedCount for multi-item multi-group', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }, { id: 'item_002' }, { id: 'item_003' }]);
      mockSelectReturns([{ id: 'mg_001' }, { id: 'mg_002' }]);

      // 2 deletes (one per group)
      mockDeleteVoid();
      mockDeleteVoid();
      // 1 bulk insert
      mockInsertBulk();

      const result = await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001', 'item_002', 'item_003'],
        modifierGroupIds: ['mg_001', 'mg_002'],
        mode: 'replace',
      });

      // 3 items x 2 groups = 6
      expect(result.assignedCount).toBe(6);
      expect(result.skippedCount).toBe(0);
    });

    // Test 18: Overrides - overrideInstructionMode
    it('overrides: overrideInstructionMode is passed correctly', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);

      const capturedValues: unknown[] = [];
      const returningFn = vi.fn().mockResolvedValue([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      const onConflictDoNothingFn = vi.fn().mockReturnValue({ returning: returningFn });
      const valuesFn = vi.fn().mockImplementation((val: unknown) => {
        capturedValues.push(val);
        return {
          returning: vi.fn().mockResolvedValue([val]),
          onConflictDoNothing: onConflictDoNothingFn,
        };
      });
      mockInsert.mockReturnValueOnce({ values: valuesFn });

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
        overrides: {
          overrideInstructionMode: 'all',
        },
      });

      const row = capturedValues[0] as Record<string, unknown>;
      expect(row.overrideInstructionMode).toBe('all');
    });

    // Test 19: Overrides - promptOrder
    it('overrides: promptOrder is passed correctly', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);

      const capturedValues: unknown[] = [];
      const returningFn = vi.fn().mockResolvedValue([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      const onConflictDoNothingFn = vi.fn().mockReturnValue({ returning: returningFn });
      const valuesFn = vi.fn().mockImplementation((val: unknown) => {
        capturedValues.push(val);
        return {
          returning: vi.fn().mockResolvedValue([val]),
          onConflictDoNothing: onConflictDoNothingFn,
        };
      });
      mockInsert.mockReturnValueOnce({ values: valuesFn });

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
        overrides: {
          promptOrder: 10,
        },
      });

      const row = capturedValues[0] as Record<string, unknown>;
      expect(row.promptOrder).toBe(10);
    });

    // Test 20: Audit log called correctly
    it('audit log is called with correct parameters after assignment', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);
      mockInsertWithConflict([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.modifier_groups.bulk_assigned',
        'catalog_item_modifier_groups',
        'bulk',
        undefined,
        { assignedCount: 1, skippedCount: 0 },
      );
    });

    // Additional edge case: no valid items found throws
    it('throws VALIDATION_ERROR when no valid items found', async () => {
      const ctx = makeCtx();

      // Items query returns empty — none belong to tenant
      mockSelectReturns([]);

      await expect(
        bulkAssignModifierGroups(ctx, {
          itemIds: ['item_fake'],
          modifierGroupIds: ['mg_001'],
          mode: 'merge',
        }),
      ).rejects.toThrow('No valid items found');
    });

    // Additional edge case: no valid groups found throws
    it('throws VALIDATION_ERROR when no valid modifier groups found', async () => {
      const ctx = makeCtx();

      // Items exist
      mockSelectReturns([{ id: 'item_001' }]);
      // Groups query returns empty — none belong to tenant
      mockSelectReturns([]);

      await expect(
        bulkAssignModifierGroups(ctx, {
          itemIds: ['item_001'],
          modifierGroupIds: ['mg_fake'],
          mode: 'merge',
        }),
      ).rejects.toThrow('No valid modifier groups found');
    });

    // Default overrides when none provided
    it('merge mode: uses default overrides when none provided', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);

      const capturedValues: unknown[] = [];
      const returningFn = vi.fn().mockResolvedValue([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);
      const onConflictDoNothingFn = vi.fn().mockReturnValue({ returning: returningFn });
      const valuesFn = vi.fn().mockImplementation((val: unknown) => {
        capturedValues.push(val);
        return {
          returning: vi.fn().mockResolvedValue([val]),
          onConflictDoNothing: onConflictDoNothingFn,
        };
      });
      mockInsert.mockReturnValueOnce({ values: valuesFn });

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'merge',
      });

      const row = capturedValues[0] as Record<string, unknown>;
      expect(row.isDefault).toBe(false);
      expect(row.overrideRequired).toBeNull();
      expect(row.overrideMinSelections).toBeNull();
      expect(row.overrideMaxSelections).toBeNull();
      expect(row.overrideInstructionMode).toBeNull();
      expect(row.promptOrder).toBe(0);
    });

    // Mode defaults to 'merge'
    it('event data reports mode as merge when not explicitly provided', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'item_001' }]);
      mockSelectReturns([{ id: 'mg_001' }]);
      mockInsertWithConflict([{ catalogItemId: 'item_001', modifierGroupId: 'mg_001' }]);

      await bulkAssignModifierGroups(ctx, {
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
      });

      const events = getCapturedEvents();
      const data = (events[0] as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.mode).toBe('merge');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // updateItemModifierAssignment
  // ────────────────────────────────────────────────────────────────

  describe('updateItemModifierAssignment', () => {
    // Test 11: Updates overrides
    it('updates override columns on junction row', async () => {
      const ctx = makeCtx();

      // Select: existing assignment found
      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: false,
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
        promptOrder: 0,
      };
      mockSelectReturns([existing]);

      // Update returns the updated row
      const updated = {
        ...existing,
        overrideRequired: true,
        overrideMinSelections: 2,
        overrideMaxSelections: 4,
        promptOrder: 3,
      };
      mockUpdateReturns(updated);

      const result = await updateItemModifierAssignment(ctx, 'item_001', 'mg_001', {
        overrideRequired: true,
        overrideMinSelections: 2,
        overrideMaxSelections: 4,
        promptOrder: 3,
      });

      expect(result.overrideRequired).toBe(true);
      expect(result.overrideMinSelections).toBe(2);
      expect(result.overrideMaxSelections).toBe(4);
      expect(result.promptOrder).toBe(3);

      // Verify event emitted
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event.eventType).toBe('catalog.item_modifier_assignment.updated.v1');
      const data = event.data as Record<string, unknown>;
      expect(data.catalogItemId).toBe('item_001');
      expect(data.modifierGroupId).toBe('mg_001');
    });

    // Test 12: Clears overrides (set to null)
    it('clears override columns when set to null', async () => {
      const ctx = makeCtx();

      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: true,
        overrideRequired: true,
        overrideMinSelections: 2,
        overrideMaxSelections: 4,
        overrideInstructionMode: 'per_option',
        promptOrder: 5,
      };
      mockSelectReturns([existing]);

      const updated = {
        ...existing,
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
      };
      mockUpdateReturns(updated);

      const result = await updateItemModifierAssignment(ctx, 'item_001', 'mg_001', {
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
      });

      expect(result.overrideRequired).toBeNull();
      expect(result.overrideMinSelections).toBeNull();
      expect(result.overrideMaxSelections).toBeNull();
      expect(result.overrideInstructionMode).toBeNull();
    });

    // Test 13: Not found
    it('throws NotFoundError when assignment does not exist', async () => {
      const ctx = makeCtx();

      // Select returns empty
      mockSelectReturns([]);

      await expect(
        updateItemModifierAssignment(ctx, 'item_nonexistent', 'mg_nonexistent', {
          overrideRequired: true,
        }),
      ).rejects.toThrow('not found');
    });

    // No-op when no updates provided
    it('returns existing row when no update fields provided', async () => {
      const ctx = makeCtx();

      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: false,
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
        promptOrder: 0,
      };
      mockSelectReturns([existing]);

      const result = await updateItemModifierAssignment(ctx, 'item_001', 'mg_001', {});

      // Should return existing without update
      expect(result.catalogItemId).toBe('item_001');
      // Update should not have been called
      expect(mockUpdate).not.toHaveBeenCalled();

      // No events emitted for no-op
      const events = getCapturedEvents();
      expect(events).toHaveLength(0);
    });

    // Audit log called
    it('calls audit log after successful update', async () => {
      const ctx = makeCtx();

      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: false,
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
        promptOrder: 0,
      };
      mockSelectReturns([existing]);
      mockUpdateReturns({ ...existing, isDefault: true });

      await updateItemModifierAssignment(ctx, 'item_001', 'mg_001', {
        isDefault: true,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.item_modifier_assignment.updated',
        'catalog_item_modifier_groups',
        'item_001/mg_001',
      );
    });

    // Validation schema tests
    it('validation: updateItemModifierAssignmentSchema accepts valid input', () => {
      const valid = updateItemModifierAssignmentSchema.safeParse({
        isDefault: true,
        overrideRequired: false,
        overrideMinSelections: 0,
        overrideMaxSelections: 5,
        overrideInstructionMode: 'per_option',
        promptOrder: 3,
      });
      expect(valid.success).toBe(true);
    });

    it('validation: rejects negative overrideMinSelections', () => {
      const invalid = updateItemModifierAssignmentSchema.safeParse({
        overrideMinSelections: -1,
      });
      expect(invalid.success).toBe(false);
    });

    it('validation: rejects overrideMaxSelections less than 1', () => {
      const invalid = updateItemModifierAssignmentSchema.safeParse({
        overrideMaxSelections: 0,
      });
      expect(invalid.success).toBe(false);
    });

    it('validation: rejects invalid overrideInstructionMode', () => {
      const invalid = updateItemModifierAssignmentSchema.safeParse({
        overrideInstructionMode: 'invalid_mode',
      });
      expect(invalid.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // removeItemModifierAssignment
  // ────────────────────────────────────────────────────────────────

  describe('removeItemModifierAssignment', () => {
    // Test 14: Deletes junction row
    it('deletes junction row and emits event', async () => {
      const ctx = makeCtx();

      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: false,
        overrideRequired: null,
        overrideMinSelections: null,
        overrideMaxSelections: null,
        overrideInstructionMode: null,
        promptOrder: 0,
      };
      mockSelectReturns([existing]);

      await removeItemModifierAssignment(ctx, 'item_001', 'mg_001');

      // Delete was called
      expect(mockDelete).toHaveBeenCalled();

      // Event emitted
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event.eventType).toBe('catalog.item_modifier_assignment.removed.v1');
      const data = event.data as Record<string, unknown>;
      expect(data.catalogItemId).toBe('item_001');
      expect(data.modifierGroupId).toBe('mg_001');
    });

    // Test 15: Not found
    it('throws NotFoundError when assignment does not exist', async () => {
      const ctx = makeCtx();

      // Select returns empty
      mockSelectReturns([]);

      await expect(
        removeItemModifierAssignment(ctx, 'item_nonexistent', 'mg_nonexistent'),
      ).rejects.toThrow('not found');
    });

    // Audit log called
    it('calls audit log after successful removal', async () => {
      const ctx = makeCtx();

      const existing = {
        catalogItemId: 'item_001',
        modifierGroupId: 'mg_001',
        isDefault: false,
      };
      mockSelectReturns([existing]);

      await removeItemModifierAssignment(ctx, 'item_001', 'mg_001');

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.item_modifier_assignment.removed',
        'catalog_item_modifier_groups',
        'item_001/mg_001',
      );
    });

    // Audit log not called when not found
    it('does not call audit log when assignment not found', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        removeItemModifierAssignment(ctx, 'item_001', 'mg_001'),
      ).rejects.toThrow('not found');

      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Validation schema edge cases
  // ────────────────────────────────────────────────────────────────

  describe('bulkAssignModifierGroupsSchema', () => {
    it('accepts exactly 500 items', () => {
      const itemIds = Array.from({ length: 500 }, (_, i) => `item_${i}`);
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds,
        modifierGroupIds: ['mg_001'],
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts exactly 20 modifier groups', () => {
      const modifierGroupIds = Array.from({ length: 20 }, (_, i) => `mg_${i}`);
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds,
      });
      expect(parsed.success).toBe(true);
    });

    it('defaults mode to merge when not specified', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.mode).toBe('merge');
      }
    });

    it('accepts replace mode', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'replace',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.mode).toBe('replace');
      }
    });

    it('rejects invalid mode value', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds: ['mg_001'],
        mode: 'upsert',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty string in itemIds', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: [''],
        modifierGroupIds: ['mg_001'],
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty string in modifierGroupIds', () => {
      const parsed = bulkAssignModifierGroupsSchema.safeParse({
        itemIds: ['item_001'],
        modifierGroupIds: [''],
      });
      expect(parsed.success).toBe(false);
    });
  });
});
