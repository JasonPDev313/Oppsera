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
  const orderByFn = vi.fn().mockResolvedValue(results);
  const limitFn = vi.fn().mockResolvedValue(results);
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
  tenants: { id: 'tenants.id' },
  locations: { id: 'locations.id', tenantId: 'locations.tenantId' },
  catalogModifierGroupCategories: {
    id: 'catalogModifierGroupCategories.id',
    tenantId: 'catalogModifierGroupCategories.tenantId',
    parentId: 'catalogModifierGroupCategories.parentId',
    name: 'catalogModifierGroupCategories.name',
    sortOrder: 'catalogModifierGroupCategories.sortOrder',
  },
  catalogModifierGroups: {
    id: 'catalogModifierGroups.id',
    tenantId: 'catalogModifierGroups.tenantId',
    name: 'catalogModifierGroups.name',
    selectionType: 'catalogModifierGroups.selectionType',
    isRequired: 'catalogModifierGroups.isRequired',
    minSelections: 'catalogModifierGroups.minSelections',
    maxSelections: 'catalogModifierGroups.maxSelections',
    categoryId: 'catalogModifierGroups.categoryId',
    instructionMode: 'catalogModifierGroups.instructionMode',
    defaultBehavior: 'catalogModifierGroups.defaultBehavior',
    channelVisibility: 'catalogModifierGroups.channelVisibility',
    sortOrder: 'catalogModifierGroups.sortOrder',
    createdAt: 'catalogModifierGroups.createdAt',
    updatedAt: 'catalogModifierGroups.updatedAt',
  },
  catalogModifiers: {
    id: 'catalogModifiers.id',
    tenantId: 'catalogModifiers.tenantId',
    modifierGroupId: 'catalogModifiers.modifierGroupId',
    name: 'catalogModifiers.name',
    priceAdjustment: 'catalogModifiers.priceAdjustment',
    extraPriceDelta: 'catalogModifiers.extraPriceDelta',
    kitchenLabel: 'catalogModifiers.kitchenLabel',
    allowNone: 'catalogModifiers.allowNone',
    allowExtra: 'catalogModifiers.allowExtra',
    allowOnSide: 'catalogModifiers.allowOnSide',
    isDefaultOption: 'catalogModifiers.isDefaultOption',
    sortOrder: 'catalogModifiers.sortOrder',
    isActive: 'catalogModifiers.isActive',
    createdAt: 'catalogModifiers.createdAt',
  },
  catalogItemModifierGroups: {
    catalogItemId: 'catalogItemModifierGroups.catalogItemId',
    modifierGroupId: 'catalogItemModifierGroups.modifierGroupId',
  },
  catalogItems: {
    id: 'catalogItems.id',
    tenantId: 'catalogItems.tenantId',
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
  desc: vi.fn((...args: unknown[]) => ['desc', ...args]),
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

// ── Imports ──────────────────────────────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';
import { createModifierGroup } from '../commands/create-modifier-group';
import { updateModifierGroup } from '../commands/update-modifier-group';
import { getModifierGroup } from '../queries/get-modifier-group';
import { listModifierGroups } from '../queries/list-modifier-groups';
import {
  createModifierGroupSchema,
  updateModifierGroupSchema,
} from '../validation';

// ── Test Data ────────────────────────────────────────────────────────

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

// ── Mock helpers ─────────────────────────────────────────────────────

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

const NOW = new Date('2026-02-24T12:00:00Z');

// ── Tests ────────────────────────────────────────────────────────────

describe('Modifier Group CRUD — Enhanced Fields', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    setupDefaultMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // createModifierGroup
  // ═══════════════════════════════════════════════════════════════════

  describe('createModifierGroup', () => {
    // ── Test 1: create with all new fields ─────────────────────────
    it('creates group with categoryId, instructionMode, defaultBehavior, channelVisibility, sortOrder', async () => {
      const ctx = makeCtx();

      // Select 1: category validation — exists
      mockSelectReturns([{ id: 'mgc_001' }]);

      const created = {
        id: 'mg_001',
        tenantId: TENANT_A,
        name: 'Cooking Temp',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        categoryId: 'mgc_001',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 5,
        createdAt: NOW,
        updatedAt: NOW,
      };
      // Insert 1: modifier group
      mockInsertReturns(created);
      // Insert 2: modifiers
      mockInsertVoid();

      const result = await createModifierGroup(ctx, {
        name: 'Cooking Temp',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        categoryId: 'mgc_001',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 5,
        modifiers: [
          { name: 'Rare', priceAdjustment: 0, sortOrder: 0 },
          { name: 'Medium', priceAdjustment: 0, sortOrder: 1 },
        ],
      });

      expect(result.id).toBe('mg_001');
      expect(result.categoryId).toBe('mgc_001');
      expect(result.instructionMode).toBe('per_option');
      expect(result.defaultBehavior).toBe('auto_select_defaults');
      expect(result.channelVisibility).toEqual(['pos', 'kiosk']);
      expect(result.sortOrder).toBe(5);
    });

    // ── Test 2: create with enhanced modifier option fields ─────────
    it('creates group with extraPriceDelta, kitchenLabel, allowNone/Extra/OnSide, isDefaultOption on modifiers', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_002',
        tenantId: TENANT_A,
        name: 'Add-Ons',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 5,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      // No categoryId — skip category lookup
      mockInsertReturns(created);
      mockInsertVoid();

      const result = await createModifierGroup(ctx, {
        name: 'Add-Ons',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 5,
        modifiers: [
          {
            name: 'Extra Cheese',
            priceAdjustment: 1.5,
            extraPriceDelta: 0.75,
            kitchenLabel: 'XTR CHZ',
            allowNone: false,
            allowExtra: true,
            allowOnSide: false,
            isDefaultOption: true,
            sortOrder: 0,
          },
          {
            name: 'Bacon',
            priceAdjustment: 2.0,
            extraPriceDelta: 1.0,
            kitchenLabel: 'BACON',
            allowNone: true,
            allowExtra: true,
            allowOnSide: true,
            isDefaultOption: false,
            sortOrder: 1,
          },
        ],
      });

      expect(result.id).toBe('mg_002');
      expect(result.name).toBe('Add-Ons');

      // Verify insert was called for modifier rows
      expect(mockInsert).toHaveBeenCalledTimes(2);

      // Verify event was emitted with modifierCount
      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data as Record<string, unknown>;
      expect(eventData.modifierCount).toBe(2);
    });

    // ── Test 3: backward compatibility — no new fields ──────────────
    it('creates group with defaults when new fields are omitted', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_003',
        tenantId: TENANT_A,
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);
      mockInsertVoid();

      const result = await createModifierGroup(ctx, {
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        modifiers: [
          { name: 'Small', priceAdjustment: 0, sortOrder: 0 },
          { name: 'Large', priceAdjustment: 2.0, sortOrder: 1 },
        ],
      });

      expect(result.id).toBe('mg_003');
      // Defaults applied
      expect(result.categoryId).toBeNull();
      expect(result.instructionMode).toBe('none');
      expect(result.defaultBehavior).toBe('none');
      expect(result.channelVisibility).toEqual(['pos', 'online', 'qr', 'kiosk']);
      expect(result.sortOrder).toBe(0);
    });

    // ── Test 4: modifier options backward compat — defaults ─────────
    it('applies default modifier option values when enhanced fields are omitted', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_004',
        tenantId: TENANT_A,
        name: 'Legacy Group',
        selectionType: 'single',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);

      // Capture the modifier rows values
      const modifierValuesFn = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: modifierValuesFn });

      const result = await createModifierGroup(ctx, {
        name: 'Legacy Group',
        modifiers: [
          { name: 'Option A', priceAdjustment: 0, sortOrder: 0 },
        ],
      });

      expect(result.id).toBe('mg_004');

      // Verify modifier insert was called with default field values
      expect(modifierValuesFn).toHaveBeenCalledTimes(1);
      const insertedRows = modifierValuesFn.mock.calls[0]![0];
      expect(insertedRows).toHaveLength(1);
      const row = insertedRows[0]!;
      expect(row.extraPriceDelta).toBeNull();
      expect(row.kitchenLabel).toBeNull();
      expect(row.allowNone).toBe(true);
      expect(row.allowExtra).toBe(true);
      expect(row.allowOnSide).toBe(true);
      expect(row.isDefaultOption).toBe(false);
    });

    // ── Test 5: emits event with instructionMode ────────────────────
    it('emits event including instructionMode field', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_005',
        tenantId: TENANT_A,
        name: 'Sauces',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 3,
        categoryId: null,
        instructionMode: 'all',
        defaultBehavior: 'none',
        channelVisibility: ['pos'],
        sortOrder: 2,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);
      mockInsertVoid();

      await createModifierGroup(ctx, {
        name: 'Sauces',
        selectionType: 'multiple',
        maxSelections: 3,
        instructionMode: 'all',
        channelVisibility: ['pos'],
        sortOrder: 2,
        modifiers: [
          { name: 'Ranch', priceAdjustment: 0, sortOrder: 0 },
        ],
      });

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data as Record<string, unknown>;
      expect(eventData.instructionMode).toBe('all');
      expect(eventData.modifierGroupId).toBe('mg_005');
      expect(eventData.name).toBe('Sauces');
    });

    // ── Test 6: audit log is called ─────────────────────────────────
    it('calls auditLog after successful creation', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_006',
        tenantId: TENANT_A,
        name: 'Toppings',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);
      mockInsertVoid();

      await createModifierGroup(ctx, {
        name: 'Toppings',
        modifiers: [{ name: 'Pepperoni', priceAdjustment: 1.5, sortOrder: 0 }],
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.modifier_group.created',
        'catalog_modifier_group',
        'mg_006',
      );
    });

    // ── Test 7: throws NotFoundError for invalid categoryId ─────────
    it('throws NotFoundError when categoryId does not exist', async () => {
      const ctx = makeCtx();

      // Select: category not found
      mockSelectReturns([]);

      await expect(
        createModifierGroup(ctx, {
          name: 'Bad Category Group',
          categoryId: 'mgc_nonexistent',
          modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
        }),
      ).rejects.toThrow('not found');

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    // ── Test 8: multiple modifiers with mixed enhanced fields ────────
    it('handles mix of modifiers with and without enhanced fields', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_008',
        tenantId: TENANT_A,
        name: 'Mixed Options',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'online'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);

      const modifierValuesFn = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: modifierValuesFn });

      await createModifierGroup(ctx, {
        name: 'Mixed Options',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'online'],
        modifiers: [
          {
            name: 'Full Option',
            priceAdjustment: 3.0,
            extraPriceDelta: 1.5,
            kitchenLabel: 'FULL',
            allowNone: false,
            allowExtra: false,
            allowOnSide: false,
            isDefaultOption: true,
            sortOrder: 0,
          },
          {
            name: 'Minimal Option',
            priceAdjustment: 0,
            sortOrder: 1,
          },
        ],
      });

      const insertedRows = modifierValuesFn.mock.calls[0]![0];
      expect(insertedRows).toHaveLength(2);

      // Full option has explicit values
      expect(insertedRows[0]!.extraPriceDelta).toBe('1.5');
      expect(insertedRows[0]!.kitchenLabel).toBe('FULL');
      expect(insertedRows[0]!.allowNone).toBe(false);
      expect(insertedRows[0]!.allowExtra).toBe(false);
      expect(insertedRows[0]!.allowOnSide).toBe(false);
      expect(insertedRows[0]!.isDefaultOption).toBe(true);

      // Minimal option has defaults
      expect(insertedRows[1]!.extraPriceDelta).toBeNull();
      expect(insertedRows[1]!.kitchenLabel).toBeNull();
      expect(insertedRows[1]!.allowNone).toBe(true);
      expect(insertedRows[1]!.allowExtra).toBe(true);
      expect(insertedRows[1]!.allowOnSide).toBe(true);
      expect(insertedRows[1]!.isDefaultOption).toBe(false);
    });

    // ── Test 9: extraPriceDelta stored as string ────────────────────
    it('converts extraPriceDelta to string for DB storage', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_009',
        tenantId: TENANT_A,
        name: 'Delta Test',
        selectionType: 'single',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);

      const modifierValuesFn = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: modifierValuesFn });

      await createModifierGroup(ctx, {
        name: 'Delta Test',
        modifiers: [
          { name: 'Extra', priceAdjustment: 2.0, extraPriceDelta: 0.5, sortOrder: 0 },
        ],
      });

      const insertedRows = modifierValuesFn.mock.calls[0]![0];
      expect(insertedRows[0]!.priceAdjustment).toBe('2');
      expect(insertedRows[0]!.extraPriceDelta).toBe('0.5');
    });

    // ── Test 10: channelVisibility defaults to all channels ─────────
    it('defaults channelVisibility to all four channels when omitted', async () => {
      const ctx = makeCtx();
      const created = {
        id: 'mg_010',
        tenantId: TENANT_A,
        name: 'Default Channels',
        selectionType: 'single',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockInsertReturns(created);
      mockInsertVoid();

      const result = await createModifierGroup(ctx, {
        name: 'Default Channels',
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });

      expect(result.channelVisibility).toEqual(['pos', 'online', 'qr', 'kiosk']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // updateModifierGroup
  // ═══════════════════════════════════════════════════════════════════

  describe('updateModifierGroup', () => {
    const existingGroup = {
      id: 'mg_100',
      tenantId: TENANT_A,
      name: 'Size',
      selectionType: 'single',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      categoryId: null,
      instructionMode: 'none',
      defaultBehavior: 'none',
      channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };

    // ── Test 11: update with new fields ─────────────────────────────
    it('updates categoryId, instructionMode, defaultBehavior, channelVisibility, sortOrder', async () => {
      const ctx = makeCtx();

      // Select 1: existing group found
      mockSelectReturns([existingGroup]);

      // Select 2: validate new categoryId
      mockSelectReturns([{ id: 'mgc_002' }]);

      const updated = {
        ...existingGroup,
        categoryId: 'mgc_002',
        instructionMode: 'all',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 10,
        updatedAt: new Date(),
      };
      mockUpdateReturns(updated);

      const result = await updateModifierGroup(ctx, 'mg_100', {
        categoryId: 'mgc_002',
        instructionMode: 'all',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 10,
      });

      expect(result.instructionMode).toBe('all');
      expect(result.defaultBehavior).toBe('auto_select_defaults');
      expect(result.channelVisibility).toEqual(['pos', 'kiosk']);
      expect(result.sortOrder).toBe(10);
    });

    // ── Test 12: partial update — only name ─────────────────────────
    it('updates only name without affecting new fields', async () => {
      const ctx = makeCtx();

      mockSelectReturns([existingGroup]);

      const updated = {
        ...existingGroup,
        name: 'Updated Size',
        updatedAt: new Date(),
      };
      mockUpdateReturns(updated);

      const result = await updateModifierGroup(ctx, 'mg_100', {
        name: 'Updated Size',
      });

      expect(result.name).toBe('Updated Size');
      // Original values preserved
      expect(result.instructionMode).toBe('none');
      expect(result.channelVisibility).toEqual(['pos', 'online', 'qr', 'kiosk']);
    });

    // ── Test 13: update with modifier deactivation and addition ─────
    it('deactivates removed modifiers and adds new ones with enhanced fields', async () => {
      const ctx = makeCtx();

      // Select 1: existing group
      mockSelectReturns([existingGroup]);
      // Update 1: group fields
      mockUpdateReturns({ ...existingGroup, name: 'Sizes', updatedAt: new Date() });
      // Select 2: existing modifiers
      mockSelectReturns([
        { id: 'mod_A', modifierGroupId: 'mg_100', name: 'Small', isActive: true },
        { id: 'mod_B', modifierGroupId: 'mg_100', name: 'Medium', isActive: true },
      ]);
      // Update 2: deactivate mod_A (not in new list)
      mockUpdateVoid();
      // Update 3: update mod_B
      mockUpdateVoid();
      // Insert: new modifier
      mockInsertVoid();

      const result = await updateModifierGroup(ctx, 'mg_100', {
        name: 'Sizes',
        modifiers: [
          {
            id: 'mod_B',
            name: 'Medium',
            priceAdjustment: 0,
            sortOrder: 0,
            isActive: true,
          },
          {
            name: 'X-Large',
            priceAdjustment: 3.0,
            extraPriceDelta: 1.5,
            kitchenLabel: 'XLRG',
            allowNone: false,
            allowExtra: true,
            allowOnSide: false,
            isDefaultOption: false,
            sortOrder: 1,
          },
        ],
      });

      expect(result.name).toBe('Sizes');
      expect(mockAuditLog).toHaveBeenCalled();
    });

    // ── Test 14: update categoryId to null (unlink) ─────────────────
    it('allows setting categoryId to null to unlink from category', async () => {
      const ctx = makeCtx();
      const groupWithCategory = {
        ...existingGroup,
        categoryId: 'mgc_001',
      };

      mockSelectReturns([groupWithCategory]);

      const updated = { ...groupWithCategory, categoryId: null, updatedAt: new Date() };
      mockUpdateReturns(updated);

      const result = await updateModifierGroup(ctx, 'mg_100', {
        categoryId: null,
      });

      expect(result.categoryId).toBeNull();
    });

    // ── Test 15: throws NotFoundError for nonexistent group ─────────
    it('throws NotFoundError when modifier group does not exist', async () => {
      const ctx = makeCtx();
      mockSelectReturns([]);

      await expect(
        updateModifierGroup(ctx, 'mg_nonexistent', { name: 'New Name' }),
      ).rejects.toThrow('not found');
    });

    // ── Test 16: throws NotFoundError for invalid categoryId ────────
    it('throws NotFoundError when updating categoryId to nonexistent category', async () => {
      const ctx = makeCtx();

      // Select 1: existing group
      mockSelectReturns([existingGroup]);
      // Select 2: category not found
      mockSelectReturns([]);

      await expect(
        updateModifierGroup(ctx, 'mg_100', { categoryId: 'mgc_bad' }),
      ).rejects.toThrow('not found');
    });

    // ── Test 17: update emits event with changes ────────────────────
    it('emits catalog.modifier_group.updated.v1 event', async () => {
      const ctx = makeCtx();
      mockSelectReturns([existingGroup]);

      const updated = {
        ...existingGroup,
        instructionMode: 'per_option',
        updatedAt: new Date(),
      };
      mockUpdateReturns(updated);

      await updateModifierGroup(ctx, 'mg_100', {
        instructionMode: 'per_option',
      });

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event.eventType).toBe('catalog.modifier_group.updated.v1');
      const eventData = event.data as Record<string, unknown>;
      expect(eventData.modifierGroupId).toBe('mg_100');
      expect(eventData.changes).toBeDefined();
    });

    // ── Test 18: update modifier enhanced fields on existing modifiers
    it('updates enhanced fields on existing modifier options', async () => {
      const ctx = makeCtx();

      mockSelectReturns([existingGroup]);
      mockUpdateReturns({ ...existingGroup, updatedAt: new Date() });

      // Existing modifiers
      mockSelectReturns([
        { id: 'mod_X', modifierGroupId: 'mg_100', name: 'Lettuce', isActive: true },
      ]);
      // Update mod_X
      mockUpdateVoid();

      await updateModifierGroup(ctx, 'mg_100', {
        modifiers: [
          {
            id: 'mod_X',
            name: 'Lettuce',
            priceAdjustment: 0,
            extraPriceDelta: 0.25,
            kitchenLabel: 'LTCE',
            allowNone: true,
            allowExtra: true,
            allowOnSide: true,
            isDefaultOption: true,
            sortOrder: 0,
            isActive: true,
          },
        ],
      });

      // Verify update was called for the modifier
      // 2 calls: one for group fields, one for mod_X
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getModifierGroup
  // ═══════════════════════════════════════════════════════════════════

  describe('getModifierGroup', () => {
    // ── Test 19: returns full detail with modifiers and assignment count
    it('returns full detail with modifiers, enhanced fields, and assignment count', async () => {
      const group = {
        id: 'mg_200',
        tenantId: TENANT_A,
        name: 'Toppings',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 5,
        categoryId: 'mgc_010',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'online'],
        sortOrder: 3,
        createdAt: NOW,
        updatedAt: NOW,
      };

      // Select 1: group
      mockSelectReturns([group]);

      // Select 2: modifiers (Promise.all — both resolve from same mockSelect)
      const modifiers = [
        {
          id: 'mod_T1',
          name: 'Pepperoni',
          priceAdjustment: '1.50',
          extraPriceDelta: '0.75',
          kitchenLabel: 'PEPP',
          allowNone: true,
          allowExtra: true,
          allowOnSide: false,
          isDefaultOption: true,
          sortOrder: 0,
          isActive: true,
        },
        {
          id: 'mod_T2',
          name: 'Mushrooms',
          priceAdjustment: '1.00',
          extraPriceDelta: null,
          kitchenLabel: null,
          allowNone: true,
          allowExtra: false,
          allowOnSide: true,
          isDefaultOption: false,
          sortOrder: 1,
          isActive: true,
        },
      ];
      mockSelectReturns(modifiers);

      // Select 3: assignment count
      mockSelectReturns([{ count: 7 }]);

      const result = await getModifierGroup(TENANT_A, 'mg_200');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('mg_200');
      expect(result!.categoryId).toBe('mgc_010');
      expect(result!.instructionMode).toBe('per_option');
      expect(result!.defaultBehavior).toBe('auto_select_defaults');
      expect(result!.channelVisibility).toEqual(['pos', 'online']);
      expect(result!.sortOrder).toBe(3);
      expect(result!.assignmentCount).toBe(7);

      // Verify modifier detail
      expect(result!.modifiers).toHaveLength(2);
      expect(result!.modifiers[0]!.name).toBe('Pepperoni');
      expect(result!.modifiers[0]!.extraPriceDelta).toBe('0.75');
      expect(result!.modifiers[0]!.kitchenLabel).toBe('PEPP');
      expect(result!.modifiers[0]!.isDefaultOption).toBe(true);
      expect(result!.modifiers[1]!.name).toBe('Mushrooms');
      expect(result!.modifiers[1]!.extraPriceDelta).toBeNull();
      expect(result!.modifiers[1]!.kitchenLabel).toBeNull();
      expect(result!.modifiers[1]!.allowOnSide).toBe(true);
    });

    // ── Test 20: returns null for nonexistent group ─────────────────
    it('returns null when modifier group does not exist', async () => {
      mockSelectReturns([]);

      const result = await getModifierGroup(TENANT_A, 'mg_nonexistent');

      expect(result).toBeNull();
    });

    // ── Test 21: zero assignment count ──────────────────────────────
    it('returns assignmentCount=0 when group is not assigned to any items', async () => {
      const group = {
        id: 'mg_201',
        tenantId: TENANT_A,
        name: 'Unassigned',
        selectionType: 'single',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: null,
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockSelectReturns([group]);
      mockSelectReturns([]);
      mockSelectReturns([{ count: 0 }]);

      const result = await getModifierGroup(TENANT_A, 'mg_201');

      expect(result).not.toBeNull();
      expect(result!.assignmentCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // listModifierGroups
  // ═══════════════════════════════════════════════════════════════════

  describe('listModifierGroups', () => {
    const groups = [
      {
        id: 'mg_A',
        tenantId: TENANT_A,
        name: 'Size',
        selectionType: 'single',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        categoryId: 'mgc_001',
        instructionMode: 'none',
        defaultBehavior: 'none',
        channelVisibility: ['pos', 'online', 'qr', 'kiosk'],
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'mg_B',
        tenantId: TENANT_A,
        name: 'Toppings',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 5,
        categoryId: 'mgc_002',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'mg_C',
        tenantId: TENANT_A,
        name: 'Cooking Temp',
        selectionType: 'single',
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        categoryId: 'mgc_001',
        instructionMode: 'all',
        defaultBehavior: 'none',
        channelVisibility: ['pos'],
        sortOrder: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const allModifiers = [
      {
        id: 'mod_A1', modifierGroupId: 'mg_A', tenantId: TENANT_A,
        name: 'Small', priceAdjustment: '0', extraPriceDelta: null, kitchenLabel: null,
        allowNone: true, allowExtra: true, allowOnSide: true, isDefaultOption: false, sortOrder: 0, isActive: true,
      },
      {
        id: 'mod_B1', modifierGroupId: 'mg_B', tenantId: TENANT_A,
        name: 'Pepperoni', priceAdjustment: '1.50', extraPriceDelta: '0.75', kitchenLabel: 'PEPP',
        allowNone: true, allowExtra: true, allowOnSide: false, isDefaultOption: true, sortOrder: 0, isActive: true,
      },
      {
        id: 'mod_C1', modifierGroupId: 'mg_C', tenantId: TENANT_A,
        name: 'Rare', priceAdjustment: '0', extraPriceDelta: null, kitchenLabel: 'RARE',
        allowNone: true, allowExtra: false, allowOnSide: false, isDefaultOption: false, sortOrder: 0, isActive: true,
      },
    ];

    // ── Test 22: list all groups ────────────────────────────────────
    it('returns all modifier groups with modifiers', async () => {
      // Select 1: groups
      mockSelectReturns(groups);
      // Select 2: all modifiers
      mockSelectReturns(allModifiers);

      const result = await listModifierGroups(TENANT_A);

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe('mg_A');
      expect(result[0]!.modifiers).toHaveLength(1);
      expect(result[1]!.id).toBe('mg_B');
      expect(result[1]!.modifiers).toHaveLength(1);
      expect(result[2]!.id).toBe('mg_C');
    });

    // ── Test 23: filter by categoryId ───────────────────────────────
    it('filters groups by categoryId', async () => {
      mockSelectReturns(groups);
      mockSelectReturns(allModifiers);

      const result = await listModifierGroups(TENANT_A, { categoryId: 'mgc_001' });

      // mg_A and mg_C have categoryId = mgc_001
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('mg_A');
      expect(result[1]!.id).toBe('mg_C');
    });

    // ── Test 24: filter by channel ──────────────────────────────────
    it('filters groups by channel visibility', async () => {
      mockSelectReturns(groups);
      mockSelectReturns(allModifiers);

      const result = await listModifierGroups(TENANT_A, { channel: 'kiosk' });

      // mg_A has ['pos','online','qr','kiosk'], mg_B has ['pos','kiosk']
      // mg_C only has ['pos'] — excluded
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.id)).toEqual(['mg_A', 'mg_B']);
    });

    // ── Test 25: filter by both categoryId and channel ──────────────
    it('applies both categoryId and channel filters', async () => {
      mockSelectReturns(groups);
      mockSelectReturns(allModifiers);

      const result = await listModifierGroups(TENANT_A, {
        categoryId: 'mgc_001',
        channel: 'kiosk',
      });

      // mgc_001: mg_A and mg_C
      // kiosk: mg_A has it, mg_C does not
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('mg_A');
    });

    // ── Test 26: empty result when no groups match filter ───────────
    it('returns empty array when no groups match filters', async () => {
      mockSelectReturns(groups);

      const result = await listModifierGroups(TENANT_A, { categoryId: 'mgc_nonexistent' });

      expect(result).toEqual([]);
    });

    // ── Test 27: empty result when tenant has no groups ─────────────
    it('returns empty array when tenant has no modifier groups', async () => {
      mockSelectReturns([]);

      const result = await listModifierGroups(TENANT_A);

      expect(result).toEqual([]);
    });

    // ── Test 28: modifiers include enhanced fields ──────────────────
    it('returns modifier enhanced fields in list results', async () => {
      mockSelectReturns(groups);
      mockSelectReturns(allModifiers);

      const result = await listModifierGroups(TENANT_A);

      const toppingsGroup = result.find((g) => g.id === 'mg_B')!;
      expect(toppingsGroup.modifiers[0]!.extraPriceDelta).toBe('0.75');
      expect(toppingsGroup.modifiers[0]!.kitchenLabel).toBe('PEPP');
      expect(toppingsGroup.modifiers[0]!.isDefaultOption).toBe(true);
      expect(toppingsGroup.modifiers[0]!.allowOnSide).toBe(false);

      const cookingGroup = result.find((g) => g.id === 'mg_C')!;
      expect(cookingGroup.modifiers[0]!.kitchenLabel).toBe('RARE');
      expect(cookingGroup.modifiers[0]!.allowExtra).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Validation schemas
  // ═══════════════════════════════════════════════════════════════════

  describe('Validation schemas', () => {
    // ── Test 29: createModifierGroupSchema with new fields ──────────
    it('createModifierGroupSchema accepts valid new fields', () => {
      const valid = createModifierGroupSchema.safeParse({
        name: 'Sauces',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 3,
        categoryId: 'mgc_001',
        instructionMode: 'per_option',
        defaultBehavior: 'auto_select_defaults',
        channelVisibility: ['pos', 'kiosk'],
        sortOrder: 5,
        modifiers: [
          {
            name: 'Ranch',
            priceAdjustment: 0.5,
            extraPriceDelta: 0.25,
            kitchenLabel: 'RCH',
            allowNone: true,
            allowExtra: true,
            allowOnSide: true,
            isDefaultOption: false,
            sortOrder: 0,
          },
        ],
      });
      expect(valid.success).toBe(true);
    });

    // ── Test 30: invalid instruction mode ───────────────────────────
    it('rejects invalid instructionMode value', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Bad Mode',
        instructionMode: 'invalid_mode',
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        const issues = invalid.error.issues.map((i) => i.path.join('.'));
        expect(issues.some((p) => p.includes('instructionMode'))).toBe(true);
      }
    });

    // ── Test 31: invalid defaultBehavior ─────────────────────────────
    it('rejects invalid defaultBehavior value', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Bad Behavior',
        defaultBehavior: 'auto_pick_random',
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        const issues = invalid.error.issues.map((i) => i.path.join('.'));
        expect(issues.some((p) => p.includes('defaultBehavior'))).toBe(true);
      }
    });

    // ── Test 32: invalid channel visibility values ──────────────────
    it('rejects invalid channel visibility values', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Bad Channels',
        channelVisibility: ['pos', 'invalid_channel', 'web'],
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalid.success).toBe(false);
    });

    // ── Test 33: schema defaults applied when fields omitted ────────
    it('applies defaults for omitted new fields', () => {
      const result = createModifierGroupSchema.safeParse({
        name: 'Minimal Group',
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.instructionMode).toBe('none');
        expect(result.data.defaultBehavior).toBe('none');
        expect(result.data.channelVisibility).toEqual(['pos', 'online', 'qr', 'kiosk']);
        expect(result.data.sortOrder).toBe(0);
        expect(result.data.selectionType).toBe('single');
        expect(result.data.isRequired).toBe(false);
        expect(result.data.minSelections).toBe(0);
      }
    });

    // ── Test 34: modifier option schema defaults ────────────────────
    it('applies modifier option defaults for enhanced fields', () => {
      const result = createModifierGroupSchema.safeParse({
        name: 'Options Defaults',
        modifiers: [{ name: 'Plain', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const mod = result.data.modifiers[0]!;
        expect(mod.allowNone).toBe(true);
        expect(mod.allowExtra).toBe(true);
        expect(mod.allowOnSide).toBe(true);
        expect(mod.isDefaultOption).toBe(false);
      }
    });

    // ── Test 35: updateModifierGroupSchema accepts partial updates ───
    it('updateModifierGroupSchema allows all fields optional', () => {
      const nameOnly = updateModifierGroupSchema.safeParse({ name: 'New Name' });
      expect(nameOnly.success).toBe(true);

      const channelOnly = updateModifierGroupSchema.safeParse({
        channelVisibility: ['pos'],
      });
      expect(channelOnly.success).toBe(true);

      const modeOnly = updateModifierGroupSchema.safeParse({
        instructionMode: 'all',
      });
      expect(modeOnly.success).toBe(true);

      const empty = updateModifierGroupSchema.safeParse({});
      expect(empty.success).toBe(true);
    });

    // ── Test 36: updateModifierGroupSchema rejects invalid values ────
    it('updateModifierGroupSchema rejects invalid instruction/behavior/channel', () => {
      const badMode = updateModifierGroupSchema.safeParse({
        instructionMode: 'bad',
      });
      expect(badMode.success).toBe(false);

      const badBehavior = updateModifierGroupSchema.safeParse({
        defaultBehavior: 'bad',
      });
      expect(badBehavior.success).toBe(false);

      const badChannel = updateModifierGroupSchema.safeParse({
        channelVisibility: ['invalid'],
      });
      expect(badChannel.success).toBe(false);
    });

    // ── Test 37: negative sortOrder rejected ────────────────────────
    it('rejects negative sortOrder', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Neg Sort',
        sortOrder: -1,
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalid.success).toBe(false);
    });

    // ── Test 38: extraPriceDelta must be multiple of 0.01 ───────────
    it('rejects extraPriceDelta that is not a multiple of 0.01', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Bad Delta',
        modifiers: [
          { name: 'Opt', priceAdjustment: 0, extraPriceDelta: 0.005, sortOrder: 0 },
        ],
      });
      expect(invalid.success).toBe(false);
    });

    // ── Test 39: kitchenLabel max length ─────────────────────────────
    it('rejects kitchenLabel exceeding 100 characters', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Long Label',
        modifiers: [
          {
            name: 'Opt',
            priceAdjustment: 0,
            kitchenLabel: 'A'.repeat(101),
            sortOrder: 0,
          },
        ],
      });
      expect(invalid.success).toBe(false);
    });

    // ── Test 40: required group with minSelections=0 rejected ───────
    it('rejects required group with minSelections < 1', () => {
      const invalid = createModifierGroupSchema.safeParse({
        name: 'Bad Required',
        isRequired: true,
        minSelections: 0,
        modifiers: [{ name: 'Opt', priceAdjustment: 0, sortOrder: 0 }],
      });
      expect(invalid.success).toBe(false);
    });
  });
});
