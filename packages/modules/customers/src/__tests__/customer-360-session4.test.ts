import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockInsert,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockPublishWithOutbox,
  mockBuildEvent,
  mockAuditLog,
} = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.groupBy = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockInsert = vi.fn();
  const mockSelect = vi.fn(() => makeSelectChain());
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    }),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });

  const mockPublishWithOutbox = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    };
    const result = await fn(tx);
    return (result as any).result;
  });

  const mockBuildEvent = vi.fn(() => ({ eventId: 'EVT_001', eventType: 'test' }));
  const mockAuditLog = vi.fn();

  return { mockInsert, mockSelect, mockUpdate, mockDelete, mockPublishWithOutbox, mockBuildEvent, mockAuditLog };
});

// ── Chain helpers ─────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function mockSelectReturns(data: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(data));
}

function mockInsertReturns(data: unknown[]) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(data),
      onConflictDoNothing: vi.fn().mockResolvedValue(data),
    }),
  });
}

function mockUpdateReturns(data: unknown[]) {
  mockUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(data),
      }),
    }),
  });
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mockPublishWithOutbox,
}));
vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mockBuildEvent,
}));
vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));
vi.mock('@oppsera/core/audit/diff', () => ({
  computeChanges: vi.fn(() => ({})),
}));
vi.mock('@oppsera/core/db/with-tenant', () => ({
  withTenant: vi.fn(async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete };
    return fn(tx);
  }),
}));
vi.mock('@oppsera/db', () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete },
  withTenant: vi.fn(async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete };
    return fn(tx);
  }),
  // Table symbols
  customers: Symbol('customers'),
  customerActivityLog: Symbol('customerActivityLog'),
  customerPrivileges: Symbol('customerPrivileges'),
  storedValueInstruments: Symbol('storedValueInstruments'),
  storedValueTransactions: Symbol('storedValueTransactions'),
  discountRules: Symbol('discountRules'),
  discountRuleUsage: Symbol('discountRuleUsage'),
  customerSegments: Symbol('customerSegments'),
  membershipPlans: Symbol('membershipPlans'),
  customerMemberships: Symbol('customerMemberships'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));
vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_004'),
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    constructor(m: string) { super(m); this.name = 'ValidationError'; }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(m: string) { super(m); this.name = 'ConflictError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id: string) { super(`${entity} ${id} not found`); this.name = 'NotFoundError'; }
  },
  AppError: class AppError extends Error {
    constructor(public code: string, m: string, public statusCode: number) { super(m); }
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  ne: vi.fn((...args: unknown[]) => ({ type: 'ne', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  not: vi.fn((arg: unknown) => ({ type: 'not', arg })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  asc: vi.fn((col: unknown) => ({ type: 'asc', col })),
  lt: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
  gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
  lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import {
  issueStoredValueSchema,
  redeemStoredValueSchema,
  reloadStoredValueSchema,
  transferStoredValueSchema,
  voidStoredValueSchema,
  createDiscountRuleSchema,
  updateDiscountRuleSchema,
  toggleDiscountRuleSchema,
} from '../validation';

import { issueStoredValue } from '../commands/issue-stored-value';
import { redeemStoredValue } from '../commands/redeem-stored-value';
import { reloadStoredValue } from '../commands/reload-stored-value';
import { transferStoredValue } from '../commands/transfer-stored-value';
import { voidStoredValue } from '../commands/void-stored-value';
import { createDiscountRule } from '../commands/create-discount-rule';
import { updateDiscountRule } from '../commands/update-discount-rule';
import { toggleDiscountRule } from '../commands/toggle-discount-rule';

import { getStoredValueInstruments } from '../queries/get-stored-value-instruments';
import { getStoredValueTransactions } from '../queries/get-stored-value-transactions';
import { getApplicableDiscountRules } from '../queries/get-applicable-discount-rules';
import { listDiscountRules } from '../queries/list-discount-rules';
import { getCustomerPrivilegesExtended } from '../queries/get-customer-privileges-extended';

// ── Test data ─────────────────────────────────────────────────

const TENANT_A = 'tenant_001';
const USER_A = 'user_001';

function makeCtx(overrides = {}): any {
  return {
    user: { id: USER_A, email: 'test@test.com', name: 'Test User', tenantId: TENANT_A, tenantStatus: 'active', membershipStatus: 'active' },
    tenantId: TENANT_A,
    locationId: 'loc_001',
    requestId: 'req_001',
    isPlatformAdmin: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('Customer 360 — Session 4: Stored Value + Discounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });

    mockSelect.mockImplementation(() => makeSelectChain([]));

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });

    mockPublishWithOutbox.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
        delete: mockDelete,
      };
      const result = await fn(tx);
      return (result as any).result;
    });
  });

  // ── Section 1: Validation Schema Tests ────────────────────────

  describe('Validation Schemas', () => {
    // ── issueStoredValueSchema ──────────────────────────────────

    it('issueStoredValueSchema — valid input passes', () => {
      const result = issueStoredValueSchema.parse({
        instrumentType: 'gift_card',
        code: 'GC-001',
        initialValueCents: 5000,
      });

      expect(result.instrumentType).toBe('gift_card');
      expect(result.code).toBe('GC-001');
      expect(result.initialValueCents).toBe(5000);
    });

    it('issueStoredValueSchema — missing instrumentType fails', () => {
      const result = issueStoredValueSchema.safeParse({
        code: 'GC-001',
        initialValueCents: 5000,
      });
      expect(result.success).toBe(false);
    });

    it('issueStoredValueSchema — negative initialValueCents fails', () => {
      const result = issueStoredValueSchema.safeParse({
        instrumentType: 'gift_card',
        code: 'GC-001',
        initialValueCents: -100,
      });
      expect(result.success).toBe(false);
    });

    it('issueStoredValueSchema — missing code fails', () => {
      const result = issueStoredValueSchema.safeParse({
        instrumentType: 'gift_card',
        initialValueCents: 5000,
      });
      expect(result.success).toBe(false);
    });

    // ── redeemStoredValueSchema ────────────────────────────────

    it('redeemStoredValueSchema — valid input passes', () => {
      const result = redeemStoredValueSchema.parse({
        instrumentId: 'SV_001',
        amountCents: 1000,
      });

      expect(result.instrumentId).toBe('SV_001');
      expect(result.amountCents).toBe(1000);
    });

    it('redeemStoredValueSchema — zero amountCents fails', () => {
      const result = redeemStoredValueSchema.safeParse({
        instrumentId: 'SV_001',
        amountCents: 0,
      });
      expect(result.success).toBe(false);
    });

    it('redeemStoredValueSchema — missing instrumentId fails', () => {
      const result = redeemStoredValueSchema.safeParse({
        amountCents: 1000,
      });
      expect(result.success).toBe(false);
    });

    // ── createDiscountRuleSchema ───────────────────────────────

    it('createDiscountRuleSchema — valid input passes', () => {
      const result = createDiscountRuleSchema.parse({
        name: '10% Member Discount',
        ruleJson: {
          conditions: [{ field: 'total', op: 'gte', value: 5000 }],
          actions: [{ type: 'percentage', value: 10 }],
        },
      });

      expect(result.name).toBe('10% Member Discount');
      expect(result.ruleJson.conditions).toHaveLength(1);
      expect(result.ruleJson.actions).toHaveLength(1);
      expect(result.scopeType).toBe('global');
      expect(result.priority).toBe(100);
    });

    it('createDiscountRuleSchema — missing name fails', () => {
      const result = createDiscountRuleSchema.safeParse({
        ruleJson: { type: 'percentage', value: 10 },
      });
      expect(result.success).toBe(false);
    });

    it('createDiscountRuleSchema — missing ruleJson fails', () => {
      const result = createDiscountRuleSchema.safeParse({
        name: '10% Member Discount',
      });
      expect(result.success).toBe(false);
    });

    it('createDiscountRuleSchema — ruleJson without conditions/actions fails', () => {
      const result = createDiscountRuleSchema.safeParse({
        name: 'Bad Rule',
        ruleJson: { type: 'percentage', value: 10 },
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Section 2: Stored Value Command Tests ────────────────────

  describe('Stored Value Commands', () => {
    // ── issueStoredValue ───────────────────────────────────────

    it('issueStoredValue — creates instrument + initial transaction', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No duplicate code
      mockSelectReturns([]);
      // Insert instrument
      mockInsertReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        initialValueCents: 5000,
        currentBalanceCents: 5000,
      }]);
      // Insert transaction (no returning needed)
      mockInsertReturns([{ id: 'SVT_001' }]);
      // Activity log insert
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await issueStoredValue(ctx, {
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        initialValueCents: 5000,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('SVI_001');
      expect(result.instrumentType).toBe('gift_card');
      expect(result.code).toBe('GC-001');
      expect(result.initialValueCents).toBe(5000);
      expect(result.currentBalanceCents).toBe(5000);
    });

    it('issueStoredValue — calls auditLog', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No duplicate code
      mockSelectReturns([]);
      // Insert instrument
      mockInsertReturns([{ id: 'SVI_002', tenantId: TENANT_A, instrumentType: 'credit_book', code: 'CB-001', status: 'active', initialValueCents: 10000, currentBalanceCents: 10000 }]);
      // Insert transaction
      mockInsertReturns([{ id: 'SVT_002' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_002' }]);

      await issueStoredValue(ctx, {
        customerId: 'CUST_001',
        instrumentType: 'credit_book',
        code: 'CB-001',
        initialValueCents: 10000,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.stored_value.issued', 'stored_value_instrument', 'SVI_002');
    });

    // ── redeemStoredValue ──────────────────────────────────────

    it('redeemStoredValue — creates redeem transaction, updates balance', async () => {
      const ctx = makeCtx();

      // Fetch instrument
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        currentBalanceCents: 5000,
        unitsRemaining: null,
        liabilityGlAccountId: null,
      }]);
      // Update instrument balance
      mockUpdateReturns([{
        id: 'SVI_001',
        currentBalanceCents: 3000,
        status: 'active',
      }]);
      // Insert redeem transaction
      mockInsertReturns([{ id: 'SVT_003' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_003' }]);

      const result = await redeemStoredValue(ctx, {
        instrumentId: 'SVI_001',
        amountCents: 2000,
      });

      expect(result).toBeDefined();
      expect(result.currentBalanceCents).toBe(3000);
      expect(result.status).toBe('active');
    });

    it('redeemStoredValue — throws when instrument not found', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        redeemStoredValue(ctx, {
          instrumentId: 'SVI_MISSING',
          amountCents: 1000,
        }),
      ).rejects.toThrow('Stored value instrument SVI_MISSING not found');
    });

    it('redeemStoredValue — throws when insufficient balance', async () => {
      const ctx = makeCtx();

      // Instrument with only 500 cents balance
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        status: 'active',
        currentBalanceCents: 500,
        unitsRemaining: null,
      }]);

      await expect(
        redeemStoredValue(ctx, {
          instrumentId: 'SVI_001',
          amountCents: 1000,
        }),
      ).rejects.toThrow('Insufficient balance');
    });

    it('redeemStoredValue — sets status to redeemed when balance reaches 0', async () => {
      const ctx = makeCtx();

      // Instrument with 1000 cents balance
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        currentBalanceCents: 1000,
        unitsRemaining: null,
        liabilityGlAccountId: null,
      }]);
      // Update instrument — fully redeemed
      mockUpdateReturns([{
        id: 'SVI_001',
        currentBalanceCents: 0,
        status: 'redeemed',
      }]);
      // Insert redeem transaction
      mockInsertReturns([{ id: 'SVT_004' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_004' }]);

      const result = await redeemStoredValue(ctx, {
        instrumentId: 'SVI_001',
        amountCents: 1000,
      });

      expect(result.currentBalanceCents).toBe(0);
      expect(result.status).toBe('redeemed');
    });

    it('redeemStoredValue — throws when instrument is not active', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        status: 'voided',
        currentBalanceCents: 0,
        unitsRemaining: null,
      }]);

      await expect(
        redeemStoredValue(ctx, {
          instrumentId: 'SVI_001',
          amountCents: 100,
        }),
      ).rejects.toThrow("Cannot redeem from instrument with status 'voided'");
    });

    // ── reloadStoredValue ──────────────────────────────────────

    it('reloadStoredValue — creates reload transaction, updates balance', async () => {
      const ctx = makeCtx();

      // Fetch instrument
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        currentBalanceCents: 2000,
        unitsRemaining: null,
        liabilityGlAccountId: null,
      }]);
      // Update instrument
      mockUpdateReturns([{
        id: 'SVI_001',
        currentBalanceCents: 7000,
        status: 'active',
      }]);
      // Insert reload transaction
      mockInsertReturns([{ id: 'SVT_005' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_005' }]);

      const result = await reloadStoredValue(ctx, {
        instrumentId: 'SVI_001',
        amountCents: 5000,
      });

      expect(result).toBeDefined();
      expect(result.currentBalanceCents).toBe(7000);
    });

    it('reloadStoredValue — throws when instrument not found', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        reloadStoredValue(ctx, {
          instrumentId: 'SVI_MISSING',
          amountCents: 1000,
        }),
      ).rejects.toThrow('Stored value instrument SVI_MISSING not found');
    });

    // ── transferStoredValue ─────────────────────────────────────

    it('transferStoredValue — creates transfer_out + transfer_in transactions', async () => {
      const ctx = makeCtx();

      // Fetch source instrument
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        currentBalanceCents: 5000,
      }]);
      // Fetch target instrument
      mockSelectReturns([{
        id: 'SVI_002',
        tenantId: TENANT_A,
        customerId: 'CUST_002',
        instrumentType: 'gift_card',
        code: 'GC-002',
        status: 'active',
        currentBalanceCents: 1000,
      }]);
      // Update source (no returning needed — update without returning in the command)
      // Update target
      // Insert transfer_out transaction
      mockInsertReturns([{ id: 'SVT_006' }]);
      // Insert transfer_in transaction
      mockInsertReturns([{ id: 'SVT_007' }]);
      // Activity log for source customer
      mockInsertReturns([{ id: 'LOG_006' }]);
      // Activity log for target customer (different from source)
      mockInsertReturns([{ id: 'LOG_007' }]);

      const result = await transferStoredValue(ctx, {
        sourceInstrumentId: 'SVI_001',
        targetInstrumentId: 'SVI_002',
        amountCents: 2000,
      } as any);

      expect(result).toBeDefined();
      expect(result.amountCents).toBe(2000);
      expect(result.newSourceBalance).toBe(3000);
      expect(result.newTargetBalance).toBe(3000);
    });

    it('transferStoredValue — throws when source instrument not found', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        transferStoredValue(ctx, {
          sourceInstrumentId: 'SVI_MISSING',
          targetInstrumentId: 'SVI_002',
          amountCents: 1000,
        } as any),
      ).rejects.toThrow('Source stored value instrument SVI_MISSING not found');
    });

    // ── voidStoredValue ─────────────────────────────────────────

    it('voidStoredValue — zeroes balance, sets status to voided', async () => {
      const ctx = makeCtx();

      // Fetch instrument
      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
        code: 'GC-001',
        status: 'active',
        currentBalanceCents: 3000,
        unitsRemaining: null,
        liabilityGlAccountId: null,
      }]);
      // Update instrument to voided
      mockUpdateReturns([{
        id: 'SVI_001',
        currentBalanceCents: 0,
        status: 'voided',
      }]);
      // Insert void transaction
      mockInsertReturns([{ id: 'SVT_008' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_008' }]);

      const result = await voidStoredValue(ctx, {
        instrumentId: 'SVI_001',
        approvedBy: 'manager_001',
        reason: 'Customer requested void',
      });

      expect(result).toBeDefined();
      expect(result.currentBalanceCents).toBe(0);
      expect(result.status).toBe('voided');
    });

    it('voidStoredValue — throws when instrument already voided', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{
        id: 'SVI_001',
        tenantId: TENANT_A,
        status: 'voided',
        currentBalanceCents: 0,
        unitsRemaining: null,
      }]);

      await expect(
        voidStoredValue(ctx, {
          instrumentId: 'SVI_001',
          approvedBy: 'manager_001',
          reason: 'Double void attempt',
        }),
      ).rejects.toThrow('Instrument is already voided');
    });
  });

  // ── Section 3: Discount Rule Command Tests ───────────────────

  describe('Discount Rule Commands', () => {
    // ── createDiscountRule ──────────────────────────────────────

    it('createDiscountRule — creates rule with all fields', async () => {
      const ctx = makeCtx();

      const ruleJson = { conditions: [{ field: 'total', op: 'gte', value: 5000 }], actions: [{ type: 'percentage', value: 10 }] };

      // Insert discount rule
      mockInsertReturns([{
        id: 'DR_001',
        tenantId: TENANT_A,
        scopeType: 'global',
        name: '10% Holiday Discount',
        description: 'Seasonal holiday promotion',
        priority: 50,
        isActive: true,
        ruleJson,
        createdBy: USER_A,
      }]);

      const result = await createDiscountRule(ctx, {
        name: '10% Holiday Discount',
        description: 'Seasonal holiday promotion',
        priority: 50,
        ruleJson,
      } as any);

      expect(result).toBeDefined();
      expect(result.id).toBe('DR_001');
      expect(result.name).toBe('10% Holiday Discount');
      expect(result.scopeType).toBe('global');
      expect(result.priority).toBe(50);
    });

    it('createDiscountRule — calls auditLog', async () => {
      const ctx = makeCtx();

      const ruleJson = { conditions: [], actions: [{ type: 'fixed', value: 500 }] };

      mockInsertReturns([{
        id: 'DR_002',
        tenantId: TENANT_A,
        scopeType: 'global',
        name: 'Test Rule',
        isActive: true,
        ruleJson,
        createdBy: USER_A,
      }]);

      await createDiscountRule(ctx, {
        name: 'Test Rule',
        ruleJson,
      } as any);

      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.discount_rule.created', 'discount_rule', 'DR_002');
    });

    // ── updateDiscountRule ──────────────────────────────────────

    it('updateDiscountRule — updates rule fields', async () => {
      const ctx = makeCtx();

      // Fetch existing rule
      mockSelectReturns([{
        id: 'DR_001',
        tenantId: TENANT_A,
        name: 'Old Name',
        priority: 100,
        ruleJson: { type: 'percentage', value: 10 },
      }]);
      // Update rule
      mockUpdateReturns([{
        id: 'DR_001',
        tenantId: TENANT_A,
        name: 'Updated Discount',
        priority: 25,
        ruleJson: { type: 'percentage', value: 15 },
      }]);

      const result = await updateDiscountRule(ctx, {
        ruleId: 'DR_001',
        name: 'Updated Discount',
        priority: 25,
        ruleJson: { conditions: [{ field: 'total', op: 'gte', value: 5000 }], actions: [{ type: 'percentage', value: 15 }] },
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Updated Discount');
      expect(result.priority).toBe(25);
    });

    it('updateDiscountRule — throws when rule not found', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        updateDiscountRule(ctx, {
          ruleId: 'DR_MISSING',
          name: 'New Name',
        }),
      ).rejects.toThrow('Discount rule DR_MISSING not found');
    });

    // ── toggleDiscountRule ─────────────────────────────────────

    it('toggleDiscountRule — toggles isActive', async () => {
      const ctx = makeCtx();

      // Fetch existing rule (active)
      mockSelectReturns([{
        id: 'DR_001',
        tenantId: TENANT_A,
        name: 'Holiday Discount',
        isActive: true,
      }]);
      // Update rule
      mockUpdateReturns([{
        id: 'DR_001',
        tenantId: TENANT_A,
        name: 'Holiday Discount',
        isActive: false,
      }]);

      const result = await toggleDiscountRule(ctx, {
        ruleId: 'DR_001',
        isActive: false,
      });

      expect(result).toBeDefined();
      expect(result.isActive).toBe(false);
      expect(mockAuditLog).toHaveBeenCalledWith(
        ctx,
        'customer.discount_rule.deactivated',
        'discount_rule',
        'DR_001',
      );
    });
  });

  // ── Section 4: Query Tests ──────────────────────────────────

  describe('Queries', () => {
    // ── getStoredValueInstruments ───────────────────────────────

    it('getStoredValueInstruments — returns instruments for customer', async () => {
      mockSelectReturns([
        {
          id: 'SVI_001',
          instrumentType: 'gift_card',
          code: 'GC-001',
          status: 'active',
          initialValueCents: 5000,
          currentBalanceCents: 3000,
          unitCount: null,
          unitsRemaining: null,
          description: 'Birthday gift card',
          expiresAt: new Date('2027-01-01T00:00:00Z'),
          issuedBy: USER_A,
          createdAt: new Date('2026-02-01T10:00:00Z'),
        },
        {
          id: 'SVI_002',
          instrumentType: 'range_card',
          code: 'RC-001',
          status: 'active',
          initialValueCents: 0,
          currentBalanceCents: 0,
          unitCount: 50,
          unitsRemaining: 35,
          description: '50-ball range card',
          expiresAt: null,
          issuedBy: USER_A,
          createdAt: new Date('2026-01-15T14:00:00Z'),
        },
      ]);

      const result = await getStoredValueInstruments({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.instruments).toHaveLength(2);
      expect(result.instruments[0]!.id).toBe('SVI_001');
      expect(result.instruments[0]!.instrumentType).toBe('gift_card');
      expect(result.instruments[0]!.currentBalanceCents).toBe(3000);
      expect(result.instruments[0]!.expiresAt).toBe('2027-01-01T00:00:00.000Z');
      expect(result.instruments[1]!.id).toBe('SVI_002');
      expect(result.instruments[1]!.unitCount).toBe(50);
      expect(result.instruments[1]!.unitsRemaining).toBe(35);
    });

    it('getStoredValueInstruments — filters by type', async () => {
      mockSelectReturns([
        {
          id: 'SVI_001',
          instrumentType: 'gift_card',
          code: 'GC-001',
          status: 'active',
          initialValueCents: 5000,
          currentBalanceCents: 5000,
          unitCount: null,
          unitsRemaining: null,
          description: null,
          expiresAt: null,
          issuedBy: USER_A,
          createdAt: new Date('2026-02-01T10:00:00Z'),
        },
      ]);

      const result = await getStoredValueInstruments({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        instrumentType: 'gift_card',
      });

      expect(result.instruments).toHaveLength(1);
      expect(result.instruments[0]!.instrumentType).toBe('gift_card');
    });

    it('getStoredValueInstruments — returns empty for non-existent customer', async () => {
      mockSelectReturns([]);

      const result = await getStoredValueInstruments({
        tenantId: TENANT_A,
        customerId: 'CUST_NOBODY',
      });

      expect(result.instruments).toHaveLength(0);
    });

    // ── getStoredValueTransactions ─────────────────────────────

    it('getStoredValueTransactions — returns transactions with pagination', async () => {
      mockSelectReturns([
        {
          id: 'SVT_002',
          txnType: 'redeem',
          amountCents: -2000,
          unitDelta: null,
          runningBalanceCents: 3000,
          sourceModule: 'pos',
          sourceId: 'ORD_001',
          reason: 'POS redemption',
          createdAt: new Date('2026-02-20T14:00:00Z'),
          createdBy: USER_A,
        },
        {
          id: 'SVT_001',
          txnType: 'issue',
          amountCents: 5000,
          unitDelta: null,
          runningBalanceCents: 5000,
          sourceModule: 'customers',
          sourceId: null,
          reason: 'Initial issuance',
          createdAt: new Date('2026-02-20T10:00:00Z'),
          createdBy: USER_A,
        },
      ]);

      const result = await getStoredValueTransactions({
        tenantId: TENANT_A,
        instrumentId: 'SVI_001',
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]!.txnType).toBe('redeem');
      expect(result.transactions[0]!.amountCents).toBe(-2000);
      expect(result.transactions[1]!.txnType).toBe('issue');
      expect(result.transactions[1]!.amountCents).toBe(5000);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getStoredValueTransactions — supports cursor pagination', async () => {
      // Return limit+1 rows to trigger hasMore (default limit=50)
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `SVT_${String(i).padStart(3, '0')}`,
        txnType: 'redeem',
        amountCents: -100,
        unitDelta: null,
        runningBalanceCents: 5000 - (i + 1) * 100,
        sourceModule: 'pos',
        sourceId: null,
        reason: null,
        createdAt: new Date(`2026-02-20T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        createdBy: USER_A,
      }));
      mockSelectReturns(rows);

      const result = await getStoredValueTransactions({
        tenantId: TENANT_A,
        instrumentId: 'SVI_001',
      });

      expect(result.transactions).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('SVT_049');
    });

    // ── getApplicableDiscountRules ─────────────────────────────

    it('getApplicableDiscountRules — returns rules ordered by priority', async () => {
      mockSelectReturns([
        {
          id: 'DR_002',
          scopeType: 'global',
          priority: 10,
          name: 'High Priority Global',
          description: null,
          ruleJson: { type: 'percentage', value: 5 },
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
        },
        {
          id: 'DR_001',
          scopeType: 'customer',
          priority: 50,
          name: 'Customer Specific',
          description: 'VIP discount',
          ruleJson: { type: 'percentage', value: 15 },
          effectiveDate: null,
          expirationDate: null,
        },
      ]);

      const result = await getApplicableDiscountRules({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0]!.priority).toBe(10);
      expect(result.rules[0]!.name).toBe('High Priority Global');
      expect(result.rules[1]!.priority).toBe(50);
      expect(result.rules[1]!.name).toBe('Customer Specific');
    });

    // ── listDiscountRules ──────────────────────────────────────

    it('listDiscountRules — returns paginated results', async () => {
      mockSelectReturns([
        {
          id: 'DR_002',
          scopeType: 'global',
          customerId: null,
          membershipClassId: null,
          segmentId: null,
          priority: 50,
          name: 'Summer Sale',
          description: '20% off all items',
          isActive: true,
          effectiveDate: '2026-06-01',
          expirationDate: '2026-08-31',
          ruleJson: { type: 'percentage', value: 20 },
          createdAt: new Date('2026-05-15T10:00:00Z'),
        },
        {
          id: 'DR_001',
          scopeType: 'customer',
          customerId: 'CUST_001',
          membershipClassId: null,
          segmentId: null,
          priority: 100,
          name: 'VIP Loyalty',
          description: null,
          isActive: true,
          effectiveDate: null,
          expirationDate: null,
          ruleJson: { type: 'fixed', value: 500 },
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ]);

      const result = await listDiscountRules({
        tenantId: TENANT_A,
      });

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0]!.id).toBe('DR_002');
      expect(result.rules[0]!.name).toBe('Summer Sale');
      expect(result.rules[1]!.id).toBe('DR_001');
      expect(result.rules[1]!.name).toBe('VIP Loyalty');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    // ── getCustomerPrivilegesExtended ──────────────────────────

    it('getCustomerPrivilegesExtended — aggregates privileges + SV summary + rule count', async () => {
      // Privileges (first Promise.all select)
      mockSelectReturns([
        {
          id: 'PRIV_001',
          privilegeType: 'discount',
          value: { percentage: 10 },
          reason: 'Gold member',
          isActive: true,
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
          expiresAt: new Date('2026-12-31T23:59:59Z'),
          notes: 'Annual discount privilege',
        },
      ]);
      // Stored value instruments grouped by type (second Promise.all select)
      mockSelectReturns([
        { instrumentType: 'gift_card', count: 2, balanceCents: 8000 },
        { instrumentType: 'range_card', count: 1, balanceCents: 0 },
      ]);
      // Discount rule count (third Promise.all select)
      mockSelectReturns([{ count: 3 }]);

      const result = await getCustomerPrivilegesExtended({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.privileges).toHaveLength(1);
      expect(result.privileges[0]!.privilegeType).toBe('discount');
      expect(result.privileges[0]!.reason).toBe('Gold member');

      expect(result.storedValueSummary.totalInstruments).toBe(3);
      expect(result.storedValueSummary.totalBalanceCents).toBe(8000);
      expect(result.storedValueSummary.byType).toHaveLength(2);
      expect(result.storedValueSummary.byType[0]!.instrumentType).toBe('gift_card');
      expect(result.storedValueSummary.byType[0]!.count).toBe(2);
      expect(result.storedValueSummary.byType[0]!.balanceCents).toBe(8000);

      expect(result.discountRuleCount).toBe(3);
    });
  });

  // ── Section 5: Additional Validation Tests ──────────────────

  describe('Additional Validation', () => {
    it('issueStoredValueSchema — accepts all instrument types', () => {
      const types = ['gift_card', 'credit_book', 'raincheck', 'range_card', 'rounds_card', 'prepaid_balance', 'punchcard', 'award'] as const;
      for (const instrumentType of types) {
        const result = issueStoredValueSchema.safeParse({
          instrumentType,
          code: `${instrumentType}-001`,
        });
        expect(result.success).toBe(true);
      }
    });

    it('issueStoredValueSchema — rejects invalid instrument type', () => {
      const result = issueStoredValueSchema.safeParse({
        instrumentType: 'bitcoin',
        code: 'BTC-001',
      });
      expect(result.success).toBe(false);
    });

    it('reloadStoredValueSchema — valid input passes', () => {
      const result = reloadStoredValueSchema.parse({
        instrumentId: 'SVI_001',
        amountCents: 2500,
      });

      expect(result.instrumentId).toBe('SVI_001');
      expect(result.amountCents).toBe(2500);
    });

    it('transferStoredValueSchema — valid input passes', () => {
      const result = transferStoredValueSchema.parse({
        sourceInstrumentId: 'SVI_001',
        targetInstrumentId: 'SVI_002',
        amountCents: 1000,
        approvedBy: 'manager_001',
      });

      expect(result.sourceInstrumentId).toBe('SVI_001');
      expect(result.targetInstrumentId).toBe('SVI_002');
      expect(result.amountCents).toBe(1000);
      expect(result.approvedBy).toBe('manager_001');
    });

    it('voidStoredValueSchema — valid input passes', () => {
      const result = voidStoredValueSchema.parse({
        instrumentId: 'SVI_001',
        approvedBy: 'manager_001',
        reason: 'Customer refund',
      });

      expect(result.instrumentId).toBe('SVI_001');
      expect(result.approvedBy).toBe('manager_001');
      expect(result.reason).toBe('Customer refund');
    });

    it('voidStoredValueSchema — missing approvedBy fails', () => {
      const result = voidStoredValueSchema.safeParse({
        instrumentId: 'SVI_001',
        reason: 'Test reason',
      });
      expect(result.success).toBe(false);
    });

    it('updateDiscountRuleSchema — valid partial update', () => {
      const result = updateDiscountRuleSchema.parse({
        ruleId: 'DR_001',
        name: 'Updated Name',
      });

      expect(result.ruleId).toBe('DR_001');
      expect(result.name).toBe('Updated Name');
    });

    it('toggleDiscountRuleSchema — valid toggle', () => {
      const result = toggleDiscountRuleSchema.parse({
        ruleId: 'DR_001',
        isActive: false,
      });

      expect(result.ruleId).toBe('DR_001');
      expect(result.isActive).toBe(false);
    });
  });
});
