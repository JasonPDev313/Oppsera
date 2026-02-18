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
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ── Chain builders ────────────────────────────────────────────

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
    receiptSnapshot: 'orders.receiptSnapshot',
    metadata: 'orders.metadata',
    shiftId: 'orders.shiftId',
    roundingAdjustment: 'orders.roundingAdjustment',
    paidAt: 'orders.paidAt',
  },
  orderLines: {
    id: 'orderLines.id',
    tenantId: 'orderLines.tenantId',
    locationId: 'orderLines.locationId',
    orderId: 'orderLines.orderId',
    sortOrder: 'orderLines.sortOrder',
    catalogItemId: 'orderLines.catalogItemId',
    catalogItemName: 'orderLines.catalogItemName',
    catalogItemSku: 'orderLines.catalogItemSku',
    itemType: 'orderLines.itemType',
    qty: 'orderLines.qty',
    unitPrice: 'orderLines.unitPrice',
    originalUnitPrice: 'orderLines.originalUnitPrice',
    priceOverrideReason: 'orderLines.priceOverrideReason',
    priceOverriddenBy: 'orderLines.priceOverriddenBy',
    lineSubtotal: 'orderLines.lineSubtotal',
    lineTax: 'orderLines.lineTax',
    lineTotal: 'orderLines.lineTotal',
    taxCalculationMode: 'orderLines.taxCalculationMode',
    modifiers: 'orderLines.modifiers',
    specialInstructions: 'orderLines.specialInstructions',
    selectedOptions: 'orderLines.selectedOptions',
    packageComponents: 'orderLines.packageComponents',
    notes: 'orderLines.notes',
    createdAt: 'orderLines.createdAt',
  },
  orderCharges: {
    id: 'orderCharges.id',
    tenantId: 'orderCharges.tenantId',
    orderId: 'orderCharges.orderId',
    chargeType: 'orderCharges.chargeType',
    name: 'orderCharges.name',
    calculationType: 'orderCharges.calculationType',
    value: 'orderCharges.value',
    amount: 'orderCharges.amount',
    isTaxable: 'orderCharges.isTaxable',
    taxAmount: 'orderCharges.taxAmount',
    createdBy: 'orderCharges.createdBy',
    createdAt: 'orderCharges.createdAt',
  },
  orderDiscounts: {
    id: 'orderDiscounts.id',
    tenantId: 'orderDiscounts.tenantId',
    orderId: 'orderDiscounts.orderId',
    type: 'orderDiscounts.type',
    value: 'orderDiscounts.value',
    amount: 'orderDiscounts.amount',
    reason: 'orderDiscounts.reason',
    createdBy: 'orderDiscounts.createdBy',
    createdAt: 'orderDiscounts.createdAt',
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
    taxRateId: 'orderLineTaxes.taxRateId',
    taxName: 'orderLineTaxes.taxName',
    rateDecimal: 'orderLineTaxes.rateDecimal',
    amount: 'orderLineTaxes.amount',
    createdAt: 'orderLineTaxes.createdAt',
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

// Mock the catalog read API and tax calc (now in core)
const mockGetItemForPOS = vi.fn();
vi.mock('@oppsera/core/helpers/catalog-read-api', () => ({
  getCatalogReadApi: () => ({
    getItemForPOS: mockGetItemForPOS,
  }),
  setCatalogReadApi: vi.fn(),
}));
vi.mock('@oppsera/core/helpers/tax-calc', () => ({
  calculateTaxes: vi.fn(
    (input: {
      lineSubtotal: number;
      calculationMode: string;
      taxRates: Array<{ taxRateId: string; taxName: string; rateDecimal: number }>;
    }) => {
      const totalRate = input.taxRates.reduce((s, r) => s + r.rateDecimal, 0);
      const taxTotal =
        input.calculationMode === 'exclusive'
          ? Math.round(input.lineSubtotal * totalRate)
          : Math.round(input.lineSubtotal - input.lineSubtotal / (1 + totalRate));
      const total =
        input.calculationMode === 'exclusive'
          ? input.lineSubtotal + taxTotal
          : input.lineSubtotal;
      return {
        calculationMode: input.calculationMode,
        subtotal:
          input.calculationMode === 'inclusive'
            ? input.lineSubtotal - taxTotal
            : input.lineSubtotal,
        taxTotal,
        total,
        breakdown: input.taxRates.map((r) => ({
          taxRateId: r.taxRateId,
          taxName: r.taxName,
          rateDecimal: r.rateDecimal,
          amount: Math.round(
            taxTotal * (totalRate > 0 ? r.rateDecimal / totalRate : 0),
          ),
        })),
      };
    },
  ),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';
import { openOrder } from '../commands/open-order';
import { addLineItem } from '../commands/add-line-item';
import { removeLineItem } from '../commands/remove-line-item';
import { addServiceCharge } from '../commands/add-service-charge';
import { removeServiceCharge } from '../commands/remove-service-charge';
import { applyDiscount } from '../commands/apply-discount';
import { placeOrder } from '../commands/place-order';
import { voidOrder } from '../commands/void-order';
import { recalculateOrderTotals } from '../helpers/order-totals';
import {
  openOrderSchema,
  addLineItemSchema,
  applyDiscountSchema,
  voidOrderSchema,
} from '../validation';
import {
  OrderOpenedDataSchema,
  OrderLineAddedDataSchema,
  OrderLineRemovedDataSchema,
  OrderServiceChargeAddedDataSchema,
  OrderServiceChargeRemovedDataSchema,
  OrderDiscountAppliedDataSchema,
  OrderPlacedDataSchema,
  OrderPaidDataSchema,
  OrderVoidedDataSchema,
} from '../events/types';

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
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
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
  return (
    ((vi as unknown as Record<string, unknown>).__capturedEvents as unknown[]) ??
    []
  );
}

const mockOrder = {
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
  receiptSnapshot: null,
  placedAt: null,
  paidAt: null,
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
};

const mockOrderDbRow = {
  id: ORDER_ID,
  tenant_id: TENANT_A,
  location_id: LOCATION_A,
  order_number: '0001',
  status: 'open',
  source: 'pos',
  version: 1,
  customer_id: null,
  subtotal: 0,
  tax_total: 0,
  service_charge_total: 0,
  discount_total: 0,
  rounding_adjustment: 0,
  total: 0,
  notes: null,
  metadata: null,
  business_date: '2026-02-16',
  terminal_id: null,
  employee_id: null,
  shift_id: null,
  receipt_snapshot: null,
  placed_at: null,
  paid_at: null,
  voided_at: null,
  void_reason: null,
  voided_by: null,
  created_at: '2026-02-16T00:00:00Z',
  updated_at: '2026-02-16T00:00:00Z',
  created_by: USER_ID,
  updated_by: USER_ID,
};

const mockPosItem = {
  id: 'item_01',
  sku: 'SKU001',
  name: 'Test Burger',
  itemType: 'food',
  isTrackable: false,
  unitPriceCents: 1200,
  taxInfo: {
    calculationMode: 'exclusive' as const,
    taxGroups: [{ id: 'tg_01', name: 'Sales Tax' }],
    taxRates: [{ id: 'tr_01', name: 'GST', rateDecimal: 0.1 }],
    totalRate: 0.1,
  },
};

// ── Tests ─────────────────────────────────────────────────────

describe('Orders Module', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockAuditLog.mockReset();
    mockExecute.mockReset();
    mockGetItemForPOS.mockReset();
    setupDefaultMocks();
  });

  // ── Section 1: Validation Schemas ─────────────────────────

  describe('Validation Schemas', () => {
    it('openOrderSchema accepts minimal input', () => {
      expect(openOrderSchema.safeParse({}).success).toBe(true);
    });

    it('openOrderSchema accepts full input', () => {
      expect(
        openOrderSchema.safeParse({
          source: 'pos',
          customerId: 'cust_01',
          businessDate: '2026-02-16',
          terminalId: 'term_01',
          employeeId: 'emp_01',
          shiftId: 'shift_01',
          notes: 'VIP',
          clientRequestId: 'req_abc',
        }).success,
      ).toBe(true);
    });

    it('openOrderSchema rejects invalid source', () => {
      expect(openOrderSchema.safeParse({ source: 'invalid' }).success).toBe(
        false,
      );
    });

    it('addLineItemSchema requires catalogItemId and qty', () => {
      expect(addLineItemSchema.safeParse({}).success).toBe(false);
      expect(
        addLineItemSchema.safeParse({ catalogItemId: 'item_01', qty: 1 })
          .success,
      ).toBe(true);
    });

    it('addLineItemSchema accepts modifiers and price override', () => {
      expect(
        addLineItemSchema.safeParse({
          catalogItemId: 'item_01',
          qty: 2,
          modifiers: [
            {
              modifierId: 'mod_01',
              name: 'Extra Cheese',
              priceAdjustment: 150,
              isDefault: false,
            },
          ],
          priceOverride: {
            unitPrice: 999,
            reason: 'comp',
            approvedBy: 'mgr_01',
          },
        }).success,
      ).toBe(true);
    });

    it('addLineItemSchema rejects negative qty', () => {
      expect(
        addLineItemSchema.safeParse({ catalogItemId: 'item_01', qty: -1 })
          .success,
      ).toBe(false);
    });

    it('voidOrderSchema requires reason', () => {
      expect(voidOrderSchema.safeParse({}).success).toBe(false);
      expect(
        voidOrderSchema.safeParse({ reason: 'Customer left' }).success,
      ).toBe(true);
    });

    it('applyDiscountSchema validates type and value', () => {
      expect(
        applyDiscountSchema.safeParse({ type: 'percentage', value: 10 })
          .success,
      ).toBe(true);
      expect(
        applyDiscountSchema.safeParse({ type: 'fixed', value: 5 }).success,
      ).toBe(true);
      expect(
        applyDiscountSchema.safeParse({ type: 'bogus', value: 10 }).success,
      ).toBe(false);
    });
  });

  // ── Section 2: recalculateOrderTotals ─────────────────────

  describe('recalculateOrderTotals', () => {
    it('returns zeros for empty order', () => {
      const totals = recalculateOrderTotals([], [], []);
      expect(totals.subtotal).toBe(0);
      expect(totals.taxTotal).toBe(0);
      expect(totals.total).toBe(0);
    });

    it('sums line totals correctly', () => {
      const lines = [
        { lineSubtotal: 1000, lineTax: 100, lineTotal: 1100 },
        { lineSubtotal: 2000, lineTax: 200, lineTotal: 2200 },
      ];
      const totals = recalculateOrderTotals(lines, [], []);
      expect(totals.subtotal).toBe(3000);
      expect(totals.taxTotal).toBe(300);
      expect(totals.total).toBe(3300);
    });

    it('includes service charges', () => {
      const lines = [{ lineSubtotal: 1000, lineTax: 100, lineTotal: 1100 }];
      const charges = [{ amount: 200, taxAmount: 20 }];
      const totals = recalculateOrderTotals(lines, charges, []);
      expect(totals.serviceChargeTotal).toBe(200);
      expect(totals.taxTotal).toBe(120);
      expect(totals.total).toBe(1320);
    });

    it('subtracts discounts', () => {
      const lines = [{ lineSubtotal: 1000, lineTax: 100, lineTotal: 1100 }];
      const discounts = [{ amount: 200 }];
      const totals = recalculateOrderTotals(lines, [], discounts);
      expect(totals.discountTotal).toBe(200);
      expect(totals.total).toBe(900);
    });

    it('never goes below zero', () => {
      const lines = [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }];
      const discounts = [{ amount: 500 }];
      const totals = recalculateOrderTotals(lines, [], discounts);
      expect(totals.total).toBe(0);
    });

    it('applies rounding adjustment', () => {
      const lines = [{ lineSubtotal: 1000, lineTax: 100, lineTotal: 1100 }];
      const totals = recalculateOrderTotals(lines, [], [], -2);
      expect(totals.total).toBe(1098);
      expect(totals.roundingAdjustment).toBe(-2);
    });
  });

  // ── Section 3: Event Schemas ──────────────────────────────

  describe('Event Schemas', () => {
    it('OrderOpenedDataSchema validates', () => {
      expect(
        OrderOpenedDataSchema.safeParse({
          orderId: 'ord_01',
          orderNumber: '0001',
          locationId: 'loc_01',
          source: 'pos',
          businessDate: '2026-02-16',
        }).success,
      ).toBe(true);
    });

    it('OrderLineAddedDataSchema validates', () => {
      expect(
        OrderLineAddedDataSchema.safeParse({
          orderId: 'ord_01',
          lineId: 'line_01',
          catalogItemId: 'item_01',
          catalogItemName: 'Burger',
          itemType: 'food',
          qty: 2,
          unitPrice: 1200,
          lineSubtotal: 2400,
          lineTax: 240,
          lineTotal: 2640,
        }).success,
      ).toBe(true);
    });

    it('OrderLineRemovedDataSchema validates', () => {
      expect(
        OrderLineRemovedDataSchema.safeParse({
          orderId: 'ord_01',
          lineId: 'line_01',
          catalogItemId: 'item_01',
          catalogItemName: 'Burger',
          qty: 2,
        }).success,
      ).toBe(true);
    });

    it('OrderServiceChargeAddedDataSchema validates', () => {
      expect(
        OrderServiceChargeAddedDataSchema.safeParse({
          orderId: 'ord_01',
          chargeId: 'chg_01',
          chargeType: 'service_charge',
          name: 'Service Fee',
          amount: 500,
        }).success,
      ).toBe(true);
    });

    it('OrderServiceChargeRemovedDataSchema validates', () => {
      expect(
        OrderServiceChargeRemovedDataSchema.safeParse({
          orderId: 'ord_01',
          chargeId: 'chg_01',
          name: 'Service Fee',
          amount: 500,
        }).success,
      ).toBe(true);
    });

    it('OrderDiscountAppliedDataSchema validates', () => {
      expect(
        OrderDiscountAppliedDataSchema.safeParse({
          orderId: 'ord_01',
          discountId: 'disc_01',
          type: 'percentage',
          value: 10,
          amount: 300,
        }).success,
      ).toBe(true);
    });

    it('OrderPlacedDataSchema validates', () => {
      expect(
        OrderPlacedDataSchema.safeParse({
          orderId: 'ord_01',
          orderNumber: '0001',
          locationId: 'loc_01',
          businessDate: '2026-02-16',
          subtotal: 3000,
          taxTotal: 300,
          total: 3300,
          lineCount: 2,
        }).success,
      ).toBe(true);
    });

    it('OrderPaidDataSchema validates', () => {
      expect(
        OrderPaidDataSchema.safeParse({
          orderId: 'ord_01',
          orderNumber: '0001',
          total: 3300,
          paidAt: '2026-02-16T12:00:00Z',
        }).success,
      ).toBe(true);
    });

    it('OrderVoidedDataSchema validates', () => {
      expect(
        OrderVoidedDataSchema.safeParse({
          orderId: 'ord_01',
          orderNumber: '0001',
          reason: 'Wrong order',
          voidedBy: 'usr_01',
        }).success,
      ).toBe(true);
    });
  });

  // ── Section 4: openOrder ──────────────────────────────────

  describe('openOrder', () => {
    it('creates order and emits event', async () => {
      const ctx = makeCtx();
      // getNextOrderNumber: tx.execute returns [{last_number: 1}]
      mockExecute.mockResolvedValueOnce([{ last_number: 1 }]);
      // insert order returning
      const created = { ...mockOrder };
      mockInsertReturns(created);
      // save idempotency key - insert void
      mockInsertVoid();

      const result = await openOrder(ctx, {}) as any;

      expect(result.id).toBe(ORDER_ID);
      expect(result.orderNumber).toBe('0001');
      expect(result.status).toBe('open');
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'order.opened',
        'order',
        ORDER_ID,
      );

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect(
        OrderOpenedDataSchema.safeParse((events[0] as any).data).success,
      ).toBe(true);
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(openOrder(ctx, {})).rejects.toThrow(
        'X-Location-Id header is required',
      );
    });

    it('uses provided businessDate', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([{ last_number: 5 }]);
      const created = {
        ...mockOrder,
        orderNumber: '0005',
        businessDate: '2026-01-01',
      };
      mockInsertReturns(created);
      mockInsertVoid();

      const result = await openOrder(ctx, { businessDate: '2026-01-01' }) as any;
      expect(result.orderNumber).toBe('0005');
    });

    it('returns cached result on duplicate clientRequestId', async () => {
      const ctx = makeCtx();
      // checkIdempotency now runs inside the transaction via tx.select().from().where()
      mockSelectReturns([{
        tenantId: TENANT_A,
        clientRequestId: 'req_dup',
        resultPayload: { id: 'cached_order' },
        expiresAt: new Date(Date.now() + 86400000),
      }]);

      const result = await openOrder(ctx, { clientRequestId: 'req_dup' }) as any;
      expect(result).toEqual({ id: 'cached_order' });
    });

    it('accepts all source types', async () => {
      for (const source of [
        'pos',
        'online',
        'admin',
        'kiosk',
        'mobile',
        'api',
      ] as const) {
        expect(openOrderSchema.safeParse({ source }).success).toBe(true);
      }
    });
  });

  // ── Section 5: addLineItem ────────────────────────────────

  describe('addLineItem', () => {
    it('adds line with tax and recalculates totals', async () => {
      const ctx = makeCtx();
      mockGetItemForPOS.mockResolvedValue(mockPosItem);
      // fetchOrderForMutation: tx.execute for SELECT...FOR UPDATE
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      // Get max sort order
      mockSelectReturns([{ maxSort: null }]);
      // Insert line
      const lineCreated = {
        id: 'line_01',
        orderId: ORDER_ID,
        catalogItemId: 'item_01',
        catalogItemName: 'Test Burger',
        catalogItemSku: 'SKU001',
        itemType: 'food',
        qty: '1',
        unitPrice: 1200,
        lineSubtotal: 1200,
        lineTax: 120,
        lineTotal: 1320,
      };
      mockInsertReturns(lineCreated);
      // Insert tax breakdown
      mockInsertVoid();
      // Select all lines for recalculation
      mockSelectReturns([
        { lineSubtotal: 1200, lineTax: 120, lineTotal: 1320 },
      ]);
      // Select all charges
      mockSelectReturns([]);
      // Select all discounts
      mockSelectReturns([]);
      // Update order totals
      mockUpdateVoid();
      // incrementVersion
      mockUpdateVoid();
      // Save idempotency
      mockInsertVoid();

      const result = (await addLineItem(ctx, ORDER_ID, {
        catalogItemId: 'item_01',
        qty: 1,
      })) as any;
      expect(result.line.id).toBe('line_01');
      expect(mockAuditLog).toHaveBeenCalled();

      const events = getCapturedEvents();
      expect(events).toHaveLength(1);
      expect(
        OrderLineAddedDataSchema.safeParse((events[0] as any).data).success,
      ).toBe(true);
    });

    it('throws when catalog item not found', async () => {
      const ctx = makeCtx();
      mockGetItemForPOS.mockResolvedValue(null);
      await expect(
        addLineItem(ctx, ORDER_ID, { catalogItemId: 'missing', qty: 1 }),
      ).rejects.toThrow('not found');
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        addLineItem(ctx, ORDER_ID, { catalogItemId: 'item_01', qty: 1 }),
      ).rejects.toThrow('X-Location-Id header is required');
    });

    it('uses price override when provided', async () => {
      const ctx = makeCtx();
      mockGetItemForPOS.mockResolvedValue(mockPosItem);
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockSelectReturns([{ maxSort: null }]);
      const lineCreated = {
        id: 'line_02',
        orderId: ORDER_ID,
        unitPrice: 999,
        originalUnitPrice: 1200,
        lineSubtotal: 999,
        lineTax: 100,
        lineTotal: 1099,
      };
      mockInsertReturns(lineCreated);
      mockInsertVoid(); // tax rows
      mockSelectReturns([{ lineSubtotal: 999, lineTax: 100, lineTotal: 1099 }]);
      mockSelectReturns([]);
      mockSelectReturns([]);
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await addLineItem(ctx, ORDER_ID, {
        catalogItemId: 'item_01',
        qty: 1,
        priceOverride: {
          unitPrice: 999,
          reason: 'comp',
          approvedBy: 'mgr_01',
        },
      })) as any;
      expect(result.line.unitPrice).toBe(999);
    });

    it('handles fractional quantities', () => {
      expect(
        addLineItemSchema.safeParse({ catalogItemId: 'item_01', qty: 0.5 })
          .success,
      ).toBe(true);
      expect(
        addLineItemSchema.safeParse({ catalogItemId: 'item_01', qty: 0.25 })
          .success,
      ).toBe(true);
    });

    it('rejects adding to non-open order', async () => {
      const ctx = makeCtx();
      mockGetItemForPOS.mockResolvedValue(mockPosItem);
      // Return a placed order
      mockExecute.mockResolvedValueOnce([
        { ...mockOrderDbRow, status: 'placed' },
      ]);

      await expect(
        addLineItem(ctx, ORDER_ID, { catalogItemId: 'item_01', qty: 1 }),
      ).rejects.toThrow('expected open');
    });
  });

  // ── Section 6: removeLineItem ─────────────────────────────

  describe('removeLineItem', () => {
    it('removes line and recalculates', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]); // fetch order
      mockSelectReturns([
        {
          id: 'line_01',
          orderId: ORDER_ID,
          catalogItemId: 'item_01',
          catalogItemName: 'Burger',
          qty: '1',
        },
      ]); // find line
      // delete tax rows, delete line
      // recalculate
      mockSelectReturns([]); // remaining lines
      mockSelectReturns([]); // charges
      mockSelectReturns([]); // discounts
      mockUpdateVoid(); // update totals
      mockUpdateVoid(); // increment version
      mockInsertVoid(); // idempotency

      const result = (await removeLineItem(ctx, ORDER_ID, {
        lineItemId: 'line_01',
      })) as any;
      expect(result.lineId).toBe('line_01');
    });

    it('throws when line not found', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockSelectReturns([]); // line not found

      await expect(
        removeLineItem(ctx, ORDER_ID, { lineItemId: 'missing' }),
      ).rejects.toThrow('not found');
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        removeLineItem(ctx, ORDER_ID, { lineItemId: 'line_01' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });
  });

  // ── Section 7: addServiceCharge ───────────────────────────

  describe('addServiceCharge', () => {
    it('adds fixed service charge and recalculates', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      const chargeCreated = {
        id: 'chg_01',
        orderId: ORDER_ID,
        chargeType: 'service_charge',
        name: 'Service Fee',
        amount: 500,
      };
      mockInsertReturns(chargeCreated);
      mockSelectReturns([]); // lines
      mockSelectReturns([{ amount: 500, taxAmount: 0 }]); // charges
      mockSelectReturns([]); // discounts
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await addServiceCharge(ctx, ORDER_ID, {
        chargeType: 'service_charge',
        name: 'Service Fee',
        calculationType: 'fixed',
        value: 500,
        isTaxable: false,
      })) as any;
      expect(result.id).toBe('chg_01');
    });

    it('calculates percentage charge on subtotal', async () => {
      const ctx = makeCtx();
      const orderWithSubtotal = { ...mockOrderDbRow, subtotal: 10000 };
      mockExecute.mockResolvedValueOnce([orderWithSubtotal]);
      // percentage = subtotal * value / 10000 = 10000 * 1000 / 10000 = 1000
      const chargeCreated = { id: 'chg_02', amount: 1000 };
      mockInsertReturns(chargeCreated);
      mockSelectReturns([]);
      mockSelectReturns([{ amount: 1000, taxAmount: 0 }]);
      mockSelectReturns([]);
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await addServiceCharge(ctx, ORDER_ID, {
        chargeType: 'auto_gratuity',
        name: '10% Gratuity',
        calculationType: 'percentage',
        value: 1000,
        isTaxable: false,
      })) as any;
      expect(result.id).toBe('chg_02');
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        addServiceCharge(ctx, ORDER_ID, {
          chargeType: 'service_charge',
          name: 'Fee',
          calculationType: 'fixed',
          value: 100,
          isTaxable: false,
        }),
      ).rejects.toThrow('X-Location-Id header is required');
    });
  });

  // ── Section 8: removeServiceCharge ────────────────────────

  describe('removeServiceCharge', () => {
    it('removes charge and recalculates', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockSelectReturns([
        { id: 'chg_01', orderId: ORDER_ID, name: 'Fee', amount: 500 },
      ]);
      mockSelectReturns([]);
      mockSelectReturns([]);
      mockSelectReturns([]);
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await removeServiceCharge(ctx, ORDER_ID, {
        chargeId: 'chg_01',
      })) as any;
      expect(result.chargeId).toBe('chg_01');
    });

    it('throws when charge not found', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockSelectReturns([]);

      await expect(
        removeServiceCharge(ctx, ORDER_ID, { chargeId: 'missing' }),
      ).rejects.toThrow('not found');
    });
  });

  // ── Section 9: applyDiscount ──────────────────────────────

  describe('applyDiscount', () => {
    it('applies percentage discount', async () => {
      const ctx = makeCtx();
      const orderWithSubtotal = { ...mockOrderDbRow, subtotal: 10000 };
      mockExecute.mockResolvedValueOnce([orderWithSubtotal]);
      const discCreated = {
        id: 'disc_01',
        type: 'percentage',
        amount: 1000,
      };
      mockInsertReturns(discCreated);
      mockSelectReturns([]); // lines
      mockSelectReturns([]); // charges
      mockSelectReturns([{ amount: 1000 }]); // discounts
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await applyDiscount(ctx, ORDER_ID, {
        type: 'percentage',
        value: 10,
      })) as any;
      expect(result.id).toBe('disc_01');
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        applyDiscount(ctx, ORDER_ID, { type: 'percentage', value: 10 }),
      ).rejects.toThrow('X-Location-Id header is required');
    });
  });

  // ── Section 10: placeOrder ────────────────────────────────

  describe('placeOrder', () => {
    it('places order with receipt snapshot', async () => {
      const ctx = makeCtx();
      const openOrderRow = {
        ...mockOrderDbRow,
        subtotal: 1200,
        tax_total: 120,
        total: 1320,
      };
      mockExecute.mockResolvedValueOnce([openOrderRow]);
      // select lines
      mockSelectReturns([
        {
          id: 'line_01',
          catalogItemName: 'Burger',
          catalogItemSku: 'SKU001',
          qty: '1',
          unitPrice: 1200,
          lineSubtotal: 1200,
          lineTax: 120,
          lineTotal: 1320,
          modifiers: null,
        },
      ]);
      // select charges
      mockSelectReturns([]);
      // select discounts
      mockSelectReturns([]);
      // select line taxes
      mockSelectReturns([
        {
          orderLineId: 'line_01',
          taxName: 'GST',
          rateDecimal: '0.1',
          amount: 120,
        },
      ]);
      // update order
      mockUpdateVoid();
      // increment version
      mockUpdateVoid();
      // idempotency
      mockInsertVoid();

      const result = await placeOrder(ctx, ORDER_ID, {}) as any;
      expect(result.status).toBe('placed');
      expect(result.receiptSnapshot).toBeDefined();
    });

    it('rejects placing order with no lines', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockSelectReturns([]); // no lines

      await expect(placeOrder(ctx, ORDER_ID, {})).rejects.toThrow(
        'at least one line item',
      );
    });

    it('rejects placing non-open order', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([
        { ...mockOrderDbRow, status: 'voided' },
      ]);

      await expect(placeOrder(ctx, ORDER_ID, {})).rejects.toThrow(
        'expected open',
      );
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(placeOrder(ctx, ORDER_ID, {})).rejects.toThrow(
        'X-Location-Id header is required',
      );
    });
  });

  // ── Section 11: voidOrder ─────────────────────────────────

  describe('voidOrder', () => {
    it('voids open order', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([mockOrderDbRow]);
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await voidOrder(ctx, ORDER_ID, {
        reason: 'Customer left',
      })) as any;
      expect(result.status).toBe('voided');
      expect(result.voidReason).toBe('Customer left');
    });

    it('voids placed order', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([
        { ...mockOrderDbRow, status: 'placed' },
      ]);
      mockUpdateVoid();
      mockUpdateVoid();
      mockInsertVoid();

      const result = (await voidOrder(ctx, ORDER_ID, {
        reason: 'Wrong items',
      })) as any;
      expect(result.status).toBe('voided');
    });

    it('rejects voiding already voided order', async () => {
      const ctx = makeCtx();
      mockExecute.mockResolvedValueOnce([
        { ...mockOrderDbRow, status: 'voided' },
      ]);

      await expect(
        voidOrder(ctx, ORDER_ID, { reason: 'test' }),
      ).rejects.toThrow('expected open or placed');
    });

    it('throws when no locationId', async () => {
      const ctx = makeCtx({ locationId: undefined });
      await expect(
        voidOrder(ctx, ORDER_ID, { reason: 'test' }),
      ).rejects.toThrow('X-Location-Id header is required');
    });
  });
});
