import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockExecute,
  mockInsert,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockTransaction,
  mockAuditLog,
  mockCheckIdempotency,
  mockFetchOrderForMutation,
  mockIncrementVersion,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockCheckIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  mockFetchOrderForMutation: vi.fn(),
  mockIncrementVersion: vi.fn().mockResolvedValue(undefined),
}));

// ── Chain builders ────────────────────────────────────────────

function setupDefaultMocks() {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'ULID_TEST_001' }]),
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
  mockCheckIdempotency.mockResolvedValue({ isDuplicate: false });
  mockIncrementVersion.mockResolvedValue(undefined);
}

function makeSelectChain(results: unknown[] = []) {
  const p = Promise.resolve(results);
  const limitFn = vi.fn().mockResolvedValue(results);
  const orderByFn = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(results),
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

// ── Module mocks ──────────────────────────────────────────────

setupDefaultMocks();

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
    query: {
      idempotencyKeys: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  },
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((str: string) => str),
  }),
  orders: {
    id: 'orders.id',
    tenantId: 'orders.tenantId',
    locationId: 'orders.locationId',
    orderNumber: 'orders.orderNumber',
    status: 'orders.status',
    source: 'orders.source',
    version: 'orders.version',
    customerId: 'orders.customerId',
    subtotal: 'orders.subtotal',
    taxTotal: 'orders.taxTotal',
    serviceChargeTotal: 'orders.serviceChargeTotal',
    discountTotal: 'orders.discountTotal',
    total: 'orders.total',
    notes: 'orders.notes',
    businessDate: 'orders.businessDate',
    terminalId: 'orders.terminalId',
    employeeId: 'orders.employeeId',
    createdBy: 'orders.createdBy',
    updatedBy: 'orders.updatedBy',
    createdAt: 'orders.createdAt',
    updatedAt: 'orders.updatedAt',
    placedAt: 'orders.placedAt',
    voidedAt: 'orders.voidedAt',
    voidReason: 'orders.voidReason',
    voidedBy: 'orders.voidedBy',
    heldAt: 'orders.heldAt',
    heldBy: 'orders.heldBy',
    receiptSnapshot: 'orders.receiptSnapshot',
    metadata: 'orders.metadata',
    shiftId: 'orders.shiftId',
    roundingAdjustment: 'orders.roundingAdjustment',
    paidAt: 'orders.paidAt',
  },
  tenders: {
    id: 'tenders.id',
    tenantId: 'tenders.tenantId',
    locationId: 'tenders.locationId',
    orderId: 'tenders.orderId',
    tenderType: 'tenders.tenderType',
    amount: 'tenders.amount',
    status: 'tenders.status',
  },
  orderLines: {
    id: 'orderLines.id',
    tenantId: 'orderLines.tenantId',
    locationId: 'orderLines.locationId',
    orderId: 'orderLines.orderId',
  },
  orderCharges: {
    id: 'orderCharges.id',
    tenantId: 'orderCharges.tenantId',
    orderId: 'orderCharges.orderId',
  },
  orderDiscounts: {
    id: 'orderDiscounts.id',
    tenantId: 'orderDiscounts.tenantId',
    orderId: 'orderDiscounts.orderId',
  },
  orderCounters: {},
  idempotencyKeys: {
    tenantId: 'idempotencyKeys.tenantId',
    clientRequestId: 'idempotencyKeys.clientRequestId',
  },
  orderLineTaxes: {
    id: 'orderLineTaxes.id',
    tenantId: 'orderLineTaxes.tenantId',
    orderLineId: 'orderLineTaxes.orderLineId',
  },
  tenants: { id: 'tenants.id' },
  locations: { id: 'locations.id', tenantId: 'locations.tenantId' },
  eventOutbox: {},
  schema: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ['eq', ...args]),
  and: vi.fn((...args: unknown[]) => ['and', ...args]),
  inArray: vi.fn((...args: unknown[]) => ['inArray', ...args]),
  lt: vi.fn((...args: unknown[]) => ['lt', ...args]),
  desc: vi.fn((...args: unknown[]) => ['desc', ...args]),
  max: vi.fn((...args: unknown[]) => ['max', ...args]),
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
  auditLogDeferred: mockAuditLog,
}));

vi.mock('../helpers/idempotency', () => ({
  checkIdempotency: mockCheckIdempotency,
  saveIdempotencyKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(
    async (
      _ctx: unknown,
      operation: (tx: unknown) => Promise<{ result: unknown; events: unknown[] }>,
    ) => {
      const tx = {
        execute: mockExecute,
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

vi.mock('../helpers/optimistic-lock', () => ({
  fetchOrderForMutation: mockFetchOrderForMutation,
  incrementVersion: mockIncrementVersion,
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';
import { holdOrder } from '../commands/hold-order';
import { recallOrder } from '../commands/recall-order';
import { reopenOrder } from '../commands/reopen-order';
import { deleteOrder } from '../commands/delete-order';

// ── Test data ─────────────────────────────────────────────────

const TENANT_A = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';
const LOCATION_A = 'loc_01TEST';
const REQUEST_ID = 'req_01TEST';
const ORDER_ID = 'ord_01TEST';

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
    locationId: LOCATION_A,
    requestId: REQUEST_ID,
    isPlatformAdmin: false,
    ...overrides,
  };
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

function mockInsertVoid() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function mockSelectReturns(results: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(results));
}

function getCapturedEvents(): unknown[] {
  return (
    ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ??
    []
  );
}

const mockOrderOpen = {
  id: ORDER_ID,
  tenantId: TENANT_A,
  locationId: LOCATION_A,
  orderNumber: '0001',
  status: 'open',
  source: 'pos',
  version: 1,
  customerId: null,
  subtotal: 0,
  taxTotal: 0,
  serviceChargeTotal: 0,
  discountTotal: 0,
  roundingAdjustment: 0,
  total: 0,
  notes: null,
  metadata: null,
  businessDate: '2026-02-16',
  terminalId: null,
  employeeId: null,
  shiftId: null,
  billingAccountId: null,
  receiptSnapshot: null,
  placedAt: null,
  paidAt: null,
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
  heldAt: null,
  heldBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
};

const mockOrderHeld = {
  ...mockOrderOpen,
  heldAt: new Date('2026-02-16T10:00:00Z'),
  heldBy: USER_ID,
};

const mockOrderVoided = {
  ...mockOrderOpen,
  status: 'voided',
  voidedAt: new Date('2026-02-16T10:00:00Z'),
  voidReason: 'Customer left',
  voidedBy: USER_ID,
};

// ── Tests ─────────────────────────────────────────────────────

describe('Order Lifecycle Commands', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    mockFetchOrderForMutation.mockReset();
    mockIncrementVersion.mockReset();
    mockCheckIdempotency.mockReset();
    setupDefaultMocks();
  });

  // ── holdOrder ────────────────────────────────────────────────

  describe('holdOrder', () => {
    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        holdOrder(ctx, ORDER_ID, { clientRequestId: 'hold-1' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });

    it('returns cached result on duplicate clientRequestId', async () => {
      const ctx = makeCtx();
      mockCheckIdempotency.mockResolvedValueOnce({
        isDuplicate: true,
        originalResult: { id: ORDER_ID, status: 'open' },
      });

      const result = await holdOrder(ctx, ORDER_ID, { clientRequestId: 'hold-dup' }) as any;
      expect(result).toEqual({ id: ORDER_ID, status: 'open' });
    });

    it('holds an open order and emits order.held.v1 event', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderOpen);
      mockUpdateVoid(); // update heldAt/heldBy
      // incrementVersion uses mockUpdate internally via the mock helper
      mockUpdateVoid(); // incrementVersion
      mockInsertVoid(); // saveIdempotencyKey

      const result = await holdOrder(ctx, ORDER_ID, { clientRequestId: 'hold-2' }) as any;

      expect(mockFetchOrderForMutation).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_A,
        ORDER_ID,
        'open',
      );
      expect(result.heldBy).toBe(USER_ID);
      expect(result.heldAt).toBeInstanceOf(Date);
      expect(result.version).toBe(2);

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'order.held', 'order', ORDER_ID);

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as any).eventType).toBe('order.held.v1');
      expect((events[0] as any).data).toMatchObject({
        orderId: ORDER_ID,
        orderNumber: '0001',
        heldBy: USER_ID,
      });
    });
  });

  // ── recallOrder ──────────────────────────────────────────────

  describe('recallOrder', () => {
    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        recallOrder(ctx, ORDER_ID, { clientRequestId: 'recall-1' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });

    it('returns cached result on duplicate clientRequestId', async () => {
      const ctx = makeCtx();
      mockCheckIdempotency.mockResolvedValueOnce({
        isDuplicate: true,
        originalResult: { id: ORDER_ID, status: 'open' },
      });

      const result = await recallOrder(ctx, ORDER_ID, { clientRequestId: 'recall-dup' }) as any;
      expect(result).toEqual({ id: ORDER_ID, status: 'open' });
    });

    it('throws ConflictError when order is not held', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderOpen); // heldAt is null

      await expect(
        recallOrder(ctx, ORDER_ID, { clientRequestId: 'recall-not-held' }),
      ).rejects.toThrow('Order is not held');
    });

    it('recalls a held order and emits order.recalled.v1 event', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderHeld);
      mockUpdateVoid(); // clear heldAt/heldBy
      mockUpdateVoid(); // incrementVersion
      mockInsertVoid(); // saveIdempotencyKey

      const result = await recallOrder(ctx, ORDER_ID, { clientRequestId: 'recall-2' }) as any;

      expect(mockFetchOrderForMutation).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_A,
        ORDER_ID,
        'open',
      );
      expect(result.heldAt).toBeNull();
      expect(result.heldBy).toBeNull();
      expect(result.version).toBe(2);

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'order.recalled', 'order', ORDER_ID);

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as any).eventType).toBe('order.recalled.v1');
      expect((events[0] as any).data).toMatchObject({
        orderId: ORDER_ID,
        orderNumber: '0001',
      });
    });
  });

  // ── reopenOrder ──────────────────────────────────────────────

  describe('reopenOrder', () => {
    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        reopenOrder(ctx, ORDER_ID, { clientRequestId: 'reopen-1' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });

    it('returns cached result on duplicate clientRequestId', async () => {
      const ctx = makeCtx();
      mockCheckIdempotency.mockResolvedValueOnce({
        isDuplicate: true,
        originalResult: { id: ORDER_ID, status: 'voided' },
      });

      const result = await reopenOrder(ctx, ORDER_ID, { clientRequestId: 'reopen-dup' }) as any;
      expect(result).toEqual({ id: ORDER_ID, status: 'voided' });
    });

    it('throws AppError REOPEN_HAS_TENDERS when order has tenders', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderVoided);
      // tenders query returns a row — order has payments
      mockSelectReturns([{ id: 'tender_01' }]);

      const err = await reopenOrder(ctx, ORDER_ID, { clientRequestId: 'reopen-tenders' }).catch(e => e);
      expect(err.code).toBe('REOPEN_HAS_TENDERS');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('Cannot reopen an order that had payments');
    });

    it('reopens a voided order with no tenders and emits order.reopened.v1 event', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderVoided);
      // tenders query returns empty — safe to reopen
      mockSelectReturns([]);
      mockUpdateVoid(); // update status/void fields
      mockUpdateVoid(); // incrementVersion
      mockInsertVoid(); // saveIdempotencyKey

      const result = await reopenOrder(ctx, ORDER_ID, { clientRequestId: 'reopen-2' }) as any;

      expect(mockFetchOrderForMutation).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_A,
        ORDER_ID,
        ['voided'],
      );
      expect(result.status).toBe('open');
      expect(result.voidedAt).toBeNull();
      expect(result.voidReason).toBeNull();
      expect(result.version).toBe(2);

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'order.reopened', 'order', ORDER_ID);

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as any).eventType).toBe('order.reopened.v1');
      expect((events[0] as any).data).toMatchObject({
        orderId: ORDER_ID,
        orderNumber: '0001',
        previousStatus: 'voided',
      });
    });
  });

  // ── deleteOrder ──────────────────────────────────────────────

  describe('deleteOrder', () => {
    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        deleteOrder(ctx, ORDER_ID, { clientRequestId: 'delete-1' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });

    it('returns cached result on duplicate clientRequestId', async () => {
      const ctx = makeCtx();
      mockCheckIdempotency.mockResolvedValueOnce({
        isDuplicate: true,
        originalResult: { id: ORDER_ID, status: 'deleted' },
      });

      const result = await deleteOrder(ctx, ORDER_ID, { clientRequestId: 'delete-dup' }) as any;
      expect(result).toEqual({ id: ORDER_ID, status: 'deleted' });
    });

    it('deletes an open order and emits order.deleted.v1 event', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderOpen);
      mockUpdateVoid(); // set status='deleted'
      mockUpdateVoid(); // incrementVersion
      mockInsertVoid(); // saveIdempotencyKey

      const result = await deleteOrder(ctx, ORDER_ID, { clientRequestId: 'delete-2' }) as any;

      expect(mockFetchOrderForMutation).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_A,
        ORDER_ID,
        ['open', 'voided'],
      );
      expect(result.status).toBe('deleted');
      expect(result.version).toBe(2);

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'order.deleted', 'order', ORDER_ID);

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as any).eventType).toBe('order.deleted.v1');
      expect((events[0] as any).data).toMatchObject({
        orderId: ORDER_ID,
        orderNumber: '0001',
      });
    });

    it('deletes a voided order and emits order.deleted.v1 event', async () => {
      const ctx = makeCtx();
      mockFetchOrderForMutation.mockResolvedValueOnce(mockOrderVoided);
      mockUpdateVoid(); // set status='deleted'
      mockUpdateVoid(); // incrementVersion
      mockInsertVoid(); // saveIdempotencyKey

      const result = await deleteOrder(ctx, ORDER_ID, { clientRequestId: 'delete-3' }) as any;

      expect(result.status).toBe('deleted');

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as any).eventType).toBe('order.deleted.v1');
    });
  });
});
