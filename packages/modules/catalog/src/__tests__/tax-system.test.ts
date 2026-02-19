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
    return mockTransaction(cb);
  },
  sql: vi.fn((...args: unknown[]) => args),
  tenants: { id: 'tenants.id' },
  locations: {
    id: 'locations.id',
    tenantId: 'locations.tenantId',
    isActive: 'locations.isActive',
  },
  taxRates: {
    id: 'taxRates.id',
    tenantId: 'taxRates.tenantId',
    name: 'taxRates.name',
    rateDecimal: 'taxRates.rateDecimal',
    isActive: 'taxRates.isActive',
  },
  taxGroups: {
    id: 'taxGroups.id',
    tenantId: 'taxGroups.tenantId',
    locationId: 'taxGroups.locationId',
    name: 'taxGroups.name',
    isActive: 'taxGroups.isActive',
  },
  taxGroupRates: {
    id: 'taxGroupRates.id',
    tenantId: 'taxGroupRates.tenantId',
    taxGroupId: 'taxGroupRates.taxGroupId',
    taxRateId: 'taxGroupRates.taxRateId',
    sortOrder: 'taxGroupRates.sortOrder',
  },
  catalogItemLocationTaxGroups: {
    id: 'catalogItemLocationTaxGroups.id',
    tenantId: 'catalogItemLocationTaxGroups.tenantId',
    locationId: 'catalogItemLocationTaxGroups.locationId',
    catalogItemId: 'catalogItemLocationTaxGroups.catalogItemId',
    taxGroupId: 'catalogItemLocationTaxGroups.taxGroupId',
  },
  catalogItems: {
    id: 'catalogItems.id',
    tenantId: 'catalogItems.tenantId',
    isActive: 'catalogItems.isActive',
  },
  taxCategories: {
    id: 'taxCategories.id',
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

import type { RequestContext } from '@oppsera/core/auth/context';
import { createTaxRate } from '../commands/create-tax-rate';
import { createTaxGroup } from '../commands/create-tax-group';
import { addTaxRateToGroup } from '../commands/add-tax-rate-to-group';
import { removeTaxRateFromGroup } from '../commands/remove-tax-rate-from-group';
import { assignItemTaxGroups } from '../commands/assign-item-tax-groups';
import { calculateTaxes } from '../tax-calc';
import type { TaxCalculationInput } from '../tax-calc';
import {
  TaxRateCreatedDataSchema,
  TaxGroupCreatedDataSchema,
  CatalogItemTaxGroupsUpdatedDataSchema,
} from '../events/types';
import {
  createTaxRateSchema,
  createTaxGroupSchema,
  assignItemTaxGroupsSchema,
} from '../validation-taxes';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';
const LOCATION_A = 'loc_01TEST';
const LOCATION_B = 'loc_02TEST';
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
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function getCapturedEvents(): unknown[] {
  return ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Tax System', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    setupDefaultMocks();
  });

  // ── Test 1: createTaxRate — happy path ──────────────────────────

  describe('createTaxRate', () => {
    it('creates tax rate and emits event', async () => {
      const ctx = makeCtx();
      // Uniqueness check → no conflict
      mockSelectReturns([]);
      // Insert returning created rate
      const created = {
        id: 'tr_001',
        tenantId: TENANT_A,
        name: 'MI State Sales Tax',
        rateDecimal: '0.0600',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(created);

      const result = await createTaxRate(ctx, { name: 'MI State Sales Tax', rateDecimal: 0.06 });

      expect(result.id).toBe('tr_001');
      expect(result.name).toBe('MI State Sales Tax');
      expect(result.rateDecimal).toBe('0.0600');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(TaxRateCreatedDataSchema.safeParse(eventData).success).toBe(true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'tax.rate.created',
        'tax_rate',
        'tr_001',
      );
    });

    // ── Test 2: createTaxRate — duplicate name rejection ───────────

    it('throws ConflictError on duplicate name', async () => {
      const ctx = makeCtx();
      mockSelectReturns([{ id: 'tr_existing', name: 'MI State Sales Tax' }]);

      await expect(
        createTaxRate(ctx, { name: 'MI State Sales Tax', rateDecimal: 0.06 }),
      ).rejects.toThrow('already exists');
    });
  });

  // ── Test 3: createTaxGroup — with rates ─────────────────────────

  describe('createTaxGroup', () => {
    it('creates tax group with rates and emits event', async () => {
      const ctx = makeCtx();
      // Select 1: location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A }]);
      // Select 2: uniqueness check → no conflict
      mockSelectReturns([]);
      // Select 3: verify tax rates exist
      mockSelectReturns([
        { id: 'tr_001', tenantId: TENANT_A },
        { id: 'tr_002', tenantId: TENANT_A },
      ]);
      // Insert group
      const created = {
        id: 'tg_001',
        tenantId: TENANT_A,
        locationId: LOCATION_A,
        name: 'Retail Tax',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(created);
      // Insert 2 group rate associations
      mockInsertVoid();
      mockInsertVoid();

      const result = await createTaxGroup(ctx, {
        locationId: LOCATION_A,
        name: 'Retail Tax',
        taxRateIds: ['tr_001', 'tr_002'],
      });

      expect(result.id).toBe('tg_001');
      expect(result.name).toBe('Retail Tax');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(TaxGroupCreatedDataSchema.safeParse(eventData).success).toBe(true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'tax.group.created',
        'tax_group',
        'tg_001',
      );
    });

    // ── Test 4: createTaxGroup — location scoped (uniqueness) ──────

    it('throws ConflictError for duplicate name at same location', async () => {
      const ctx = makeCtx();
      // Location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A }]);
      // Uniqueness check → existing group found
      mockSelectReturns([{ id: 'tg_existing', name: 'Retail Tax' }]);

      await expect(
        createTaxGroup(ctx, {
          locationId: LOCATION_A,
          name: 'Retail Tax',
          taxRateIds: ['tr_001'],
        }),
      ).rejects.toThrow('already exists');
    });
  });

  // ── Test 5: add/remove tax rate from group ──────────────────────

  describe('addTaxRateToGroup / removeTaxRateFromGroup', () => {
    it('adds a rate and then removes it', async () => {
      const ctx = makeCtx();

      // ADD: group exists
      mockSelectReturns([{ id: 'tg_001', tenantId: TENANT_A }]);
      // ADD: rate exists
      mockSelectReturns([{ id: 'tr_003', tenantId: TENANT_A }]);
      // ADD: insert (with onConflictDoNothing)
      mockInsertVoid();

      await addTaxRateToGroup(ctx, {
        taxGroupId: 'tg_001',
        taxRateId: 'tr_003',
        sortOrder: 2,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'tax.group.rate_added',
        'tax_group',
        'tg_001',
      );

      // Reset for remove
      mockAuditLog.mockReset();

      // REMOVE: group exists
      mockSelectReturns([{ id: 'tg_001', tenantId: TENANT_A }]);

      await removeTaxRateFromGroup(ctx, {
        taxGroupId: 'tg_001',
        taxRateId: 'tr_003',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'tax.group.rate_removed',
        'tax_group',
        'tg_001',
      );
    });
  });

  // ── Tests 6-8: assignItemTaxGroups ──────────────────────────────

  describe('assignItemTaxGroups', () => {
    // ── Test 6: happy path assignment ──────────────────────────────

    it('assigns tax groups to item at location', async () => {
      const ctx = makeCtx();
      // Item exists
      mockSelectReturns([{ id: 'item_001', tenantId: TENANT_A }]);
      // Location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A }]);
      // Tax groups exist at location
      mockSelectReturns([
        { id: 'tg_001', tenantId: TENANT_A, locationId: LOCATION_A, isActive: true },
        { id: 'tg_002', tenantId: TENANT_A, locationId: LOCATION_A, isActive: true },
      ]);
      // Delete existing assignments (default mock)
      // Insert new assignments
      mockInsertVoid();
      mockInsertVoid();

      const result = await assignItemTaxGroups(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        taxGroupIds: ['tg_001', 'tg_002'],
      });

      expect(result.catalogItemId).toBe('item_001');
      expect(result.taxGroupIds).toEqual(['tg_001', 'tg_002']);

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      const eventData = (events[0] as Record<string, unknown>).data;
      expect(CatalogItemTaxGroupsUpdatedDataSchema.safeParse(eventData).success).toBe(true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'catalog.item.tax_groups.updated',
        'catalog_item',
        'item_001',
      );
    });

    // ── Test 7: full replacement (empty array clears assignments) ──

    it('clears all assignments when given empty taxGroupIds', async () => {
      const ctx = makeCtx();
      // Item exists
      mockSelectReturns([{ id: 'item_001', tenantId: TENANT_A }]);
      // Location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A }]);
      // No groups to validate (empty array)

      const result = await assignItemTaxGroups(ctx, {
        catalogItemId: 'item_001',
        locationId: LOCATION_A,
        taxGroupIds: [],
      });

      expect(result.taxGroupIds).toEqual([]);
      // Delete was called (for clearing), no inserts needed
      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // ── Tests 9-11: getItemTaxes (via internal API) ─────────────────
  // Internal API uses withTenant which calls mockTransaction

  describe('getItemTaxes (internal API)', () => {
    // ── Test 9: multiple rates across groups ────────────────────────

    it('returns merged tax rates from assigned groups', async () => {
      // We test this by calling the internal API directly
      // But since it's tightly coupled to DB, we'll test via the mock transaction
      const { getCatalogReadApi, setCatalogReadApi } = await import('../internal-api');

      // Reset to get a fresh API instance that uses our mocks
      setCatalogReadApi(null as never);
      const api = getCatalogReadApi();

      // Mock the transaction to execute the callback with our mock tx
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: mockSelect,
          insert: mockInsert,
          delete: mockDelete,
        };
        return cb(tx);
      });

      // Select 1: assignments for item at location
      mockSelectReturns([{ taxGroupId: 'tg_001' }, { taxGroupId: 'tg_002' }]);
      // Select 2: active tax groups
      mockSelectReturns([
        { id: 'tg_001', tenantId: TENANT_A, name: 'Retail Tax', isActive: true },
        { id: 'tg_002', tenantId: TENANT_A, name: 'County Tax', isActive: true },
      ]);
      // Select 3: group rate associations
      mockSelectReturns([
        { taxRateId: 'tr_001', sortOrder: 0 },
        { taxRateId: 'tr_002', sortOrder: 1 },
        { taxRateId: 'tr_001', sortOrder: 0 }, // duplicate from second group
      ]);
      // Select 4: active tax rates
      mockSelectReturns([
        { id: 'tr_001', name: 'State Tax', rateDecimal: '0.0600', isActive: true },
        { id: 'tr_002', name: 'County Tax', rateDecimal: '0.0150', isActive: true },
      ]);

      const info = await api.getItemTaxes(TENANT_A, LOCATION_A, 'item_001');

      expect(info.calculationMode).toBe('exclusive');
      expect(info.taxGroups).toHaveLength(2);
      expect(info.taxRates).toHaveLength(2); // deduplicated
      expect(info.totalRate).toBeCloseTo(0.075);
    });

    // ── Test 10: no assignments returns empty ────────────────────────

    it('returns empty when no tax groups assigned', async () => {
      const { getCatalogReadApi, setCatalogReadApi } = await import('../internal-api');
      setCatalogReadApi(null as never);
      const api = getCatalogReadApi();

      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { select: mockSelect };
        return cb(tx);
      });

      // No assignments
      mockSelectReturns([]);

      const info = await api.getItemTaxes(TENANT_A, LOCATION_A, 'item_no_tax');

      expect(info.calculationMode).toBe('exclusive');
      expect(info.taxGroups).toEqual([]);
      expect(info.taxRates).toEqual([]);
      expect(info.totalRate).toBe(0);
    });

    // ── Test 11: different locations have different taxes ───────────

    it('returns location-specific tax info', async () => {
      const { getCatalogReadApi, setCatalogReadApi } = await import('../internal-api');
      setCatalogReadApi(null as never);
      const api = getCatalogReadApi();

      // Location A query
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { select: mockSelect };
        return cb(tx);
      });

      // Location A has 1 group with 1 rate
      mockSelectReturns([{ taxGroupId: 'tg_A1' }]);
      mockSelectReturns([{ id: 'tg_A1', tenantId: TENANT_A, name: 'Tax A', isActive: true }]);
      mockSelectReturns([{ taxRateId: 'tr_A1', sortOrder: 0 }]);
      mockSelectReturns([{ id: 'tr_A1', name: 'Rate A', rateDecimal: '0.0600', isActive: true }]);

      const infoA = await api.getItemTaxes(TENANT_A, LOCATION_A, 'item_001');
      expect(infoA.totalRate).toBeCloseTo(0.06);
      expect(infoA.taxRates).toHaveLength(1);

      // Location B query
      setCatalogReadApi(null as never);
      const api2 = getCatalogReadApi();

      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { select: mockSelect };
        return cb(tx);
      });

      // Location B has 1 group with 2 rates
      mockSelectReturns([{ taxGroupId: 'tg_B1' }]);
      mockSelectReturns([{ id: 'tg_B1', tenantId: TENANT_A, name: 'Tax B', isActive: true }]);
      mockSelectReturns([{ taxRateId: 'tr_B1', sortOrder: 0 }, { taxRateId: 'tr_B2', sortOrder: 1 }]);
      mockSelectReturns([
        { id: 'tr_B1', name: 'Rate B1', rateDecimal: '0.0600', isActive: true },
        { id: 'tr_B2', name: 'Rate B2', rateDecimal: '0.0150', isActive: true },
      ]);

      const infoB = await api2.getItemTaxes(TENANT_A, LOCATION_B, 'item_001');
      // getItemTaxes always returns 'exclusive' as default — caller (getItemForPOS) overrides from item.priceIncludesTax
      expect(infoB.calculationMode).toBe('exclusive');
      expect(infoB.totalRate).toBeCloseTo(0.075);
      expect(infoB.taxRates).toHaveLength(2);
    });
  });

  // ── Tests 12-15: calculateTaxes ─────────────────────────────────

  describe('calculateTaxes', () => {
    // ── Test 12: exclusive mode ────────────────────────────────────

    it('calculates exclusive taxes correctly', () => {
      const input: TaxCalculationInput = {
        lineSubtotal: 1000, // $10.00 in cents
        calculationMode: 'exclusive',
        taxRates: [
          { taxRateId: 'tr_001', taxName: 'State Tax', rateDecimal: 0.06 },
          { taxRateId: 'tr_002', taxName: 'County Tax', rateDecimal: 0.015 },
        ],
      };

      const result = calculateTaxes(input);

      expect(result.calculationMode).toBe('exclusive');
      expect(result.subtotal).toBe(1000);
      expect(result.taxTotal).toBe(75); // 1000 * 0.075 = 75
      expect(result.total).toBe(1075); // 1000 + 75
      expect(result.breakdown).toHaveLength(2);

      // State: 75 * (0.06/0.075) = 60
      expect(result.breakdown[0]!.taxName).toBe('State Tax');
      expect(result.breakdown[0]!.amount).toBe(60);
      // County: remainder = 75 - 60 = 15
      expect(result.breakdown[1]!.taxName).toBe('County Tax');
      expect(result.breakdown[1]!.amount).toBe(15);
    });

    // ── Test 13: inclusive mode ────────────────────────────────────

    it('calculates inclusive taxes correctly', () => {
      const input: TaxCalculationInput = {
        lineSubtotal: 1075, // $10.75 price includes tax
        calculationMode: 'inclusive',
        taxRates: [
          { taxRateId: 'tr_001', taxName: 'State Tax', rateDecimal: 0.06 },
          { taxRateId: 'tr_002', taxName: 'County Tax', rateDecimal: 0.015 },
        ],
      };

      const result = calculateTaxes(input);

      expect(result.calculationMode).toBe('inclusive');
      // taxTotal = 1075 - (1075 / 1.075) = 1075 - 1000 = 75
      expect(result.taxTotal).toBe(75);
      expect(result.total).toBe(1075); // inclusive: total = subtotal input
      expect(result.subtotal).toBe(1000); // 1075 - 75
      expect(result.breakdown).toHaveLength(2);
    });

    // ── Test 14: no rates ─────────────────────────────────────────

    it('returns zero tax when no rates provided', () => {
      const input: TaxCalculationInput = {
        lineSubtotal: 5000,
        calculationMode: 'exclusive',
        taxRates: [],
      };

      const result = calculateTaxes(input);

      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(5000);
      expect(result.subtotal).toBe(5000);
      expect(result.breakdown).toEqual([]);
    });

    // ── Test 15: rounding with multiple rates ──────────────────────

    it('handles rounding correctly with last-rate-gets-remainder', () => {
      const input: TaxCalculationInput = {
        lineSubtotal: 999, // $9.99
        calculationMode: 'exclusive',
        taxRates: [
          { taxRateId: 'tr_001', taxName: 'Rate A', rateDecimal: 0.06 },
          { taxRateId: 'tr_002', taxName: 'Rate B', rateDecimal: 0.015 },
          { taxRateId: 'tr_003', taxName: 'Rate C', rateDecimal: 0.0075 },
        ],
      };

      const result = calculateTaxes(input);

      // taxTotal = round(999 * 0.0825) = round(82.4175) = 82
      expect(result.taxTotal).toBe(82);
      expect(result.total).toBe(1081);

      // Verify breakdown sums to taxTotal exactly (no rounding drift)
      const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
      expect(breakdownSum).toBe(result.taxTotal);
    });
  });

  // ── Test 16: Validation schema tests ────────────────────────────

  describe('Validation schemas', () => {
    it('validates createTaxRate schema', () => {
      const valid = createTaxRateSchema.safeParse({ name: 'Test Rate', rateDecimal: 0.06 });
      expect(valid.success).toBe(true);

      const invalid = createTaxRateSchema.safeParse({ name: '', rateDecimal: 1.5 });
      expect(invalid.success).toBe(false);
    });

    it('validates createTaxGroup schema', () => {
      const valid = createTaxGroupSchema.safeParse({
        locationId: 'loc_01',
        name: 'Test Group',
        taxRateIds: ['tr_01'],
      });
      expect(valid.success).toBe(true);

      const missingRates = createTaxGroupSchema.safeParse({
        locationId: 'loc_01',
        name: 'Test',
        taxRateIds: [],
      });
      expect(missingRates.success).toBe(false);
    });

    it('validates assignItemTaxGroups schema', () => {
      const valid = assignItemTaxGroupsSchema.safeParse({
        locationId: 'loc_01',
        catalogItemId: 'item_01',
        taxGroupIds: ['tg_01', 'tg_02'],
      });
      expect(valid.success).toBe(true);

      const emptyOk = assignItemTaxGroupsSchema.safeParse({
        locationId: 'loc_01',
        catalogItemId: 'item_01',
        taxGroupIds: [],
      });
      expect(emptyOk.success).toBe(true);
    });
  });

  // ── Test 17: RLS tenant isolation ───────────────────────────────

  describe('Tenant isolation', () => {
    it('rejects operations on tax rates from another tenant', async () => {
      const ctx = makeCtx();

      // addTaxRateToGroup: group not found (belongs to different tenant)
      mockSelectReturns([]);

      await expect(
        addTaxRateToGroup(ctx, {
          taxGroupId: 'tg_other_tenant',
          taxRateId: 'tr_001',
          sortOrder: 0,
        }),
      ).rejects.toThrow('not found');
    });

    it('rejects operations on tax groups from another tenant', async () => {
      const ctx = makeCtx();

      // removeTaxRateFromGroup: group not found
      mockSelectReturns([]);

      await expect(
        removeTaxRateFromGroup(ctx, {
          taxGroupId: 'tg_other_tenant',
          taxRateId: 'tr_001',
        }),
      ).rejects.toThrow('not found');
    });
  });

  // ── Test 18: API route validation ───────────────────────────────

  describe('API route validation patterns', () => {
    it('validates tax rate creation through full pipeline', async () => {
      const ctx = makeCtx();
      const rawInput = { name: '  State Tax  ', rateDecimal: 0.06 };
      const parsed = createTaxRateSchema.safeParse(rawInput);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      // Trimmed name
      expect(parsed.data.name).toBe('State Tax');

      // Now run through command
      mockSelectReturns([]);
      const created = {
        id: 'tr_new',
        tenantId: TENANT_A,
        name: 'State Tax',
        rateDecimal: '0.0600',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(created);

      const result = await createTaxRate(ctx, parsed.data);
      expect(result.id).toBe('tr_new');
      expect(result.name).toBe('State Tax');
    });

    it('validates tax group creation with rate verification', async () => {
      const ctx = makeCtx();
      const rawInput = {
        locationId: LOCATION_A,
        name: 'Food Tax',
        taxRateIds: ['tr_001', 'tr_002'],
      };
      const parsed = createTaxGroupSchema.safeParse(rawInput);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      // Location exists
      mockSelectReturns([{ id: LOCATION_A, tenantId: TENANT_A }]);
      // No duplicate
      mockSelectReturns([]);
      // Rates exist
      mockSelectReturns([
        { id: 'tr_001', tenantId: TENANT_A },
        { id: 'tr_002', tenantId: TENANT_A },
      ]);
      // Insert group
      const created = {
        id: 'tg_new',
        tenantId: TENANT_A,
        locationId: LOCATION_A,
        name: 'Food Tax',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: null,
      };
      mockInsertReturns(created);
      // Insert rate associations
      mockInsertVoid();
      mockInsertVoid();

      const result = await createTaxGroup(ctx, parsed.data);
      expect(result.id).toBe('tg_new');
    });
  });
});
