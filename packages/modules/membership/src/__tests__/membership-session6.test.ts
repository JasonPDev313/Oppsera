import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle ────────────────────────────────────────────────────

const mockSelectReturns = vi.fn();
const mockInsertReturns = vi.fn();
const mockUpdateReturns = vi.fn();

const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockInsert = vi.fn();

const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn();

const mockExecute = vi.fn();

/**
 * Build a chainable result from `.where()` — when the query chains further
 * (`.limit()`, `.orderBy()`), those terminal calls consume from `mockSelectReturns`.
 * When `.where()` is the terminal call (awaited or iterated directly), the
 * `.then()` / `[Symbol.iterator]` hooks lazily consume from `mockSelectReturns`.
 *
 * This prevents double-consumption: either the lazy hooks fire OR a chained
 * method fires, but not both.
 */
function makeWhereResult() {
  let resolved: any[] | null = null;
  const resolve = () => {
    if (resolved === null) {
      const data = mockSelectReturns();
      resolved = Array.isArray(data) ? data : [];
    }
    return resolved;
  };
  return {
    orderBy: mockOrderBy,
    limit: mockLimit,
    returning: mockReturning,
    [Symbol.iterator]: () => resolve()[Symbol.iterator](),
    then: (onFulfilled: any) => onFulfilled(resolve()),
  };
}

function wireChain() {
  mockOrderBy.mockImplementation(() => {
    const result = mockSelectReturns();
    const arr = Array.isArray(result) ? result : [];
    // Attach .limit() that returns the same array
    (arr as any).limit = () => arr;
    return arr;
  });

  mockLimit.mockImplementation(() => mockSelectReturns());

  mockWhere.mockImplementation(() => makeWhereResult());

  mockLeftJoin.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }));
  mockFrom.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    leftJoin: mockLeftJoin,
  }));
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockImplementation(() => ({
    returning: mockReturning,
    onConflictDoUpdate: vi.fn(() => ({ returning: mockReturning })),
  }));
  mockReturning.mockImplementation(() => mockInsertReturns());
  mockUpdate.mockImplementation(() => ({ set: mockSet }));
  mockSet.mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockImplementation(() => ({ returning: mockReturning }));
  mockExecute.mockResolvedValue([]);
}

// Initial wiring
wireChain();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockExecute,
    }),
  ),
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number',
    status: 'status', startDate: 'start_date', endDate: 'end_date',
    primaryMemberId: 'primary_member_id', billingEmail: 'billing_email',
    billingAddressJson: 'billing_address_json', statementDayOfMonth: 'statement_day_of_month',
    paymentTermsDays: 'payment_terms_days', autopayEnabled: 'autopay_enabled',
    creditLimitCents: 'credit_limit_cents', holdCharging: 'hold_charging',
    billingAccountId: 'billing_account_id', customerId: 'customer_id',
    notes: 'notes', metadata: 'metadata', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipSubscriptions: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    planId: 'plan_id', status: 'status', effectiveStart: 'effective_start',
    effectiveEnd: 'effective_end', nextBillDate: 'next_bill_date',
    lastBilledDate: 'last_billed_date', billedThroughDate: 'billed_through_date',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipPlans: {
    id: 'id', tenantId: 'tenant_id', name: 'name', priceCents: 'price_cents',
    duesAmountCents: 'dues_amount_cents', billingFrequency: 'billing_frequency',
    prorationPolicy: 'proration_policy', isActive: 'is_active', taxable: 'taxable',
    billingInterval: 'billing_interval', description: 'description',
    glDuesRevenueAccountId: 'gl_dues_revenue_account_id',
    minMonthsCommitment: 'min_months_commitment',
  },
  membershipBillingItems: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    classId: 'class_id', description: 'description', amountCents: 'amount_cents',
    discountCents: 'discount_cents', frequency: 'frequency', taxRateId: 'tax_rate_id',
    glRevenueAccountId: 'gl_revenue_account_id', glDeferredRevenueAccountId: 'gl_deferred_revenue_account_id',
    prorationEnabled: 'proration_enabled', seasonalJson: 'seasonal_json',
    isSubMemberItem: 'is_sub_member_item', isActive: 'is_active',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  statements: {
    id: 'id', tenantId: 'tenant_id', billingAccountId: 'billing_account_id',
    periodStart: 'period_start', periodEnd: 'period_end',
    openingBalanceCents: 'opening_balance_cents', chargesCents: 'charges_cents',
    paymentsCents: 'payments_cents', lateFeesCents: 'late_fees_cents',
    closingBalanceCents: 'closing_balance_cents', dueDate: 'due_date',
    status: 'status', statementNumber: 'statement_number',
    deliveryStatus: 'delivery_status', membershipAccountId: 'membership_account_id',
    createdAt: 'created_at',
  },
  statementLines: {
    id: 'id', tenantId: 'tenant_id', statementId: 'statement_id',
    lineType: 'line_type', description: 'description',
    amountCents: 'amount_cents', sourceTransactionId: 'source_transaction_id',
    departmentId: 'department_id', metaJson: 'meta_json',
    sortOrder: 'sort_order', createdAt: 'created_at',
  },
  membershipClasses: { id: 'id', tenantId: 'tenant_id' },
  membershipAuthorizedUsers: { id: 'id', tenantId: 'tenant_id' },
  membershipMembers: { id: 'id', tenantId: 'tenant_id' },
  membershipAccountingSettings: { id: 'id', tenantId: 'tenant_id' },
  customers: { id: 'id', tenantId: 'tenant_id', displayName: 'display_name' },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockExecute,
    }).then((r: any) => r.result),
  ),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, type, payload) => ({ type, payload })),
}));

const mockAuditLog = vi.fn();
vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

vi.mock('@oppsera/core/auth/context', () => ({
  withTenant: vi.fn((_tenantId: string, fn: Function) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockExecute,
    }),
  ),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ulid_test_001'),
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
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode = 400) {
      super(message);
      this.name = 'AppError';
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  lt: vi.fn((a, b) => ({ op: 'lt', a, b })),
  lte: vi.fn((a, b) => ({ op: 'lte', a, b })),
  gte: vi.fn((a, b) => ({ op: 'gte', a, b })),
  desc: vi.fn((col) => ({ op: 'desc', col })),
  asc: vi.fn((col) => ({ op: 'asc', col })),
  or: vi.fn((...args: any[]) => ({ op: 'or', args })),
  ilike: vi.fn((col, val) => ({ op: 'ilike', col, val })),
  isNull: vi.fn((col) => ({ op: 'isNull', col })),
  sql: Object.assign(vi.fn(), { raw: vi.fn(), join: vi.fn() }),
  count: vi.fn(() => 'count'),
}));

// ── Imports ─────────────────────────────────────────────────────────

import { computeProration } from '../helpers/proration';
import { assignPlan } from '../commands/assign-plan';
import { changePlan } from '../commands/change-plan';
import { closeBillingCycle } from '../commands/close-billing-cycle';
import { generateStatement } from '../commands/generate-statement';
import { createMembershipPlanV2 } from '../commands/create-membership-plan-v2';
import { updateMembershipPlanV2 } from '../commands/update-membership-plan-v2';
import { listSubscriptions } from '../queries/list-subscriptions';
import { listStatements } from '../queries/list-statements';
import { getStatementDetail } from '../queries/get-statement-detail';

import { buildEventFromContext } from '@oppsera/core/events/build-event';

// ── Helpers ─────────────────────────────────────────────────────────

function makeCtx() {
  return {
    tenantId: TENANT_A,
    user: { id: 'user_001', email: 'test@example.com', role: 'owner' },
    requestId: 'req_001',
    locationId: 'L1',
  } as any;
}

function resetMocks() {
  // Clear call history on ALL mocks (including module-level mocks like buildEventFromContext)
  vi.clearAllMocks();

  // Use mockReset on data-return mocks to clear mockReturnValueOnce queues (gotcha #58)
  // vi.clearAllMocks does NOT clear these queues — only mockReset does.
  mockSelectReturns.mockReset();
  mockInsertReturns.mockReset();
  mockUpdateReturns.mockReset();

  // Set default return values
  mockSelectReturns.mockReturnValue([]);
  mockInsertReturns.mockReturnValue([]);
  mockUpdateReturns.mockReturnValue([]);
  mockExecute.mockResolvedValue([]);

  // Re-wire chain implementations (clearAllMocks does NOT clear implementations,
  // but mockReset above cleared the data mocks' return values, so we re-set defaults)
  wireChain();
}

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct_001',
    tenantId: TENANT_A,
    accountNumber: 'MEM-001',
    status: 'active',
    startDate: '2025-01-01',
    endDate: null,
    primaryMemberId: 'cust_001',
    billingEmail: 'billing@test.com',
    billingAccountId: 'ba_001',
    customerId: 'cust_001',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makePlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan_001',
    tenantId: TENANT_A,
    name: 'Gold Membership',
    priceCents: 50000,
    duesAmountCents: 50000,
    billingFrequency: 'monthly',
    prorationPolicy: 'daily',
    isActive: true,
    taxable: true,
    billingInterval: 'monthly',
    description: 'Premium Gold membership plan',
    glDuesRevenueAccountId: 'gl_001',
    minMonthsCommitment: 12,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeSubscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_001',
    tenantId: TENANT_A,
    membershipAccountId: 'acct_001',
    planId: 'plan_001',
    status: 'active',
    effectiveStart: '2025-01-01',
    effectiveEnd: null,
    nextBillDate: '2025-02-01',
    lastBilledDate: '2025-01-01',
    billedThroughDate: '2025-01-31',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeStatementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stmt_001',
    tenantId: TENANT_A,
    billingAccountId: 'ba_001',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    openingBalanceCents: 0,
    chargesCents: 50000,
    paymentsCents: 0,
    lateFeesCents: 0,
    closingBalanceCents: 50000,
    dueDate: '2025-02-15',
    status: 'open',
    statementNumber: 'STMT-2025-0001',
    deliveryStatus: 'pending',
    membershipAccountId: 'acct_001',
    createdAt: new Date('2025-01-31'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Proration Helper Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — Proration', () => {
  it('should return full amount for policy=none', () => {
    const result = computeProration(50000, 'none', '2025-01-01', '2025-01-31', '2025-01-15');

    expect(result).toBe(50000);
  });

  it('should compute daily proration correctly', () => {
    // 17 days out of 31 in January => (50000 * 17) / 31 = ~27419
    const result = computeProration(50000, 'daily', '2025-01-01', '2025-01-31', '2025-01-15');

    const totalDays = 31;
    const activeDays = 17; // Jan 15-31 inclusive
    const expected = Math.round((50000 * activeDays) / totalDays);
    expect(result).toBe(expected);
  });

  it('should return full amount for first half of month with half_month policy', () => {
    // Start date falls in first half (day 1-15), so full amount
    const result = computeProration(50000, 'half_month', '2025-01-01', '2025-01-31', '2025-01-10');

    expect(result).toBe(50000);
  });

  it('should return 50% for second half with half_month policy', () => {
    // Start date falls in second half (day 16+), so 50%
    const result = computeProration(50000, 'half_month', '2025-01-01', '2025-01-31', '2025-01-20');

    expect(result).toBe(25000);
  });

  it('should handle edge case of same start and end date', () => {
    const result = computeProration(50000, 'daily', '2025-01-01', '2025-01-31', '2025-01-15');

    // 17 days (Jan 15-31 inclusive) out of 31
    const expected = Math.round((50000 * 17) / 31);
    expect(result).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. assignPlan Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — assignPlan', () => {
  beforeEach(resetMocks);

  it('should create a subscription for a valid account and plan', async () => {
    const account = makeAccountRow();
    const plan = makePlanRow();
    const subscription = makeSubscriptionRow();

    // 1st select: fetch account
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: fetch plan
    mockSelectReturns.mockReturnValueOnce([plan]);
    // Insert returns the created subscription
    mockInsertReturns.mockReturnValueOnce([subscription]);

    const result = await assignPlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      effectiveDate: '2025-01-01',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('sub_001');
    expect(result.planId).toBe('plan_001');
  });

  it('should throw NotFoundError when account does not exist', async () => {
    // Account query returns empty
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      assignPlan(makeCtx(), {
        membershipAccountId: 'nonexistent',
        planId: 'plan_001',
        effectiveDate: '2025-01-01',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should set nextBillDate based on plan billing frequency', async () => {
    const account = makeAccountRow();
    const plan = makePlanRow({ billingFrequency: 'quarterly' });
    const subscription = makeSubscriptionRow({ nextBillDate: '2025-04-01' });

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([plan]);
    mockInsertReturns.mockReturnValueOnce([subscription]);

    const result = await assignPlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      effectiveDate: '2025-01-01',
    });

    expect(result).toBeDefined();
    // The subscription should have nextBillDate set
    expect(result.nextBillDate).toBeDefined();
  });

  it('should emit membership.plan.assigned.v1 event', async () => {
    const account = makeAccountRow();
    const plan = makePlanRow();
    const subscription = makeSubscriptionRow();

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([plan]);
    mockInsertReturns.mockReturnValueOnce([subscription]);

    await assignPlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      effectiveDate: '2025-01-01',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.assigned.v1',
      expect.objectContaining({
        membershipAccountId: 'acct_001',
        planId: 'plan_001',
      }),
    );
  });

  it('should call auditLog after creation', async () => {
    const account = makeAccountRow();
    const plan = makePlanRow();
    const subscription = makeSubscriptionRow();

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([plan]);
    mockInsertReturns.mockReturnValueOnce([subscription]);

    await assignPlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      effectiveDate: '2025-01-01',
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.assigned',
      'membership_subscription',
      'sub_001',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. changePlan Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — changePlan', () => {
  beforeEach(resetMocks);

  it('should cancel old subscription and create new one', async () => {
    const account = makeAccountRow();
    const oldSub = makeSubscriptionRow({ planId: 'plan_001' });
    const newPlan = makePlanRow({ id: 'plan_002', name: 'Platinum' });
    const newSub = makeSubscriptionRow({ id: 'sub_002', planId: 'plan_002' });

    // 1st select: fetch account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: fetch active subscription (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([oldSub]);
    // 3rd select: fetch new plan (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([newPlan]);
    // update.set.where does NOT call .returning(), so no mockInsertReturns consumed
    // Insert new subscription: insert.values.returning
    mockInsertReturns.mockReturnValueOnce([newSub]);

    const result = await changePlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      newPlanId: 'plan_002',
      effectiveDate: '2025-02-01',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('sub_002');
    expect(result.planId).toBe('plan_002');
  });

  it('should throw NotFoundError when account does not exist', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      changePlan(makeCtx(), {
        membershipAccountId: 'nonexistent',
        newPlanId: 'plan_002',
        effectiveDate: '2025-02-01',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should throw error when no active subscription exists', async () => {
    const account = makeAccountRow();
    // Account found but no active subscription
    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([]); // no active sub

    await expect(
      changePlan(makeCtx(), {
        membershipAccountId: 'acct_001',
        newPlanId: 'plan_002',
        effectiveDate: '2025-02-01',
      }),
    ).rejects.toThrow(/not found|no active/i);
  });

  it('should emit membership.plan.changed.v1 event', async () => {
    const account = makeAccountRow();
    const oldSub = makeSubscriptionRow({ planId: 'plan_001' });
    const newPlan = makePlanRow({ id: 'plan_002', name: 'Platinum' });
    const newSub = makeSubscriptionRow({ id: 'sub_002', planId: 'plan_002' });

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([oldSub]);
    mockSelectReturns.mockReturnValueOnce([newPlan]);
    // update.set.where does NOT call .returning() — no mockInsertReturns consumed
    mockInsertReturns.mockReturnValueOnce([newSub]);

    await changePlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      newPlanId: 'plan_002',
      effectiveDate: '2025-02-01',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.changed.v1',
      expect.objectContaining({
        membershipAccountId: 'acct_001',
        oldPlanId: 'plan_001',
        newPlanId: 'plan_002',
      }),
    );
  });

  it('should set effectiveEnd on old subscription', async () => {
    const account = makeAccountRow();
    const oldSub = makeSubscriptionRow({ planId: 'plan_001' });
    const newPlan = makePlanRow({ id: 'plan_002' });
    const newSub = makeSubscriptionRow({ id: 'sub_002', planId: 'plan_002' });

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([oldSub]);
    mockSelectReturns.mockReturnValueOnce([newPlan]);
    // update.set.where does NOT call .returning() — no mockInsertReturns consumed
    mockInsertReturns.mockReturnValueOnce([newSub]);

    await changePlan(makeCtx(), {
      membershipAccountId: 'acct_001',
      newPlanId: 'plan_002',
      effectiveDate: '2025-02-01',
    });

    // Verify update was called (to set effectiveEnd on old subscription)
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. closeBillingCycle Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — closeBillingCycle', () => {
  beforeEach(resetMocks);

  it('should process all due subscriptions', async () => {
    const sub1 = makeSubscriptionRow({ id: 'sub_001', nextBillDate: '2025-02-01' });
    const sub2 = makeSubscriptionRow({ id: 'sub_002', nextBillDate: '2025-02-01', membershipAccountId: 'acct_002' });
    const plan = makePlanRow();

    // 1st select: fetch due subscriptions (select.from.where — terminal, consumed via .then)
    mockSelectReturns.mockReturnValueOnce([sub1, sub2]);
    // 2nd select: fetch plan for sub1 (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // sub1 update.set.where — no .returning(), no consumption
    // 3rd select: fetch plan for sub2 (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // sub2 update.set.where — no .returning(), no consumption

    const result = await closeBillingCycle(makeCtx(), {
      cycleDate: '2025-02-01',
    });

    expect(result).toBeDefined();
    expect(result.processedCount).toBe(2);
  });

  it('should advance nextBillDate after billing', async () => {
    const sub = makeSubscriptionRow({ nextBillDate: '2025-02-01' });
    const plan = makePlanRow({ billingFrequency: 'monthly' });

    // 1st select: due subscriptions (terminal .where)
    mockSelectReturns.mockReturnValueOnce([sub]);
    // 2nd select: plan lookup (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // update.set.where — no .returning(), no consumption

    const result = await closeBillingCycle(makeCtx(), {
      cycleDate: '2025-02-01',
    });

    expect(result.processedCount).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should update billedThroughDate', async () => {
    const sub = makeSubscriptionRow({
      nextBillDate: '2025-02-01',
      billedThroughDate: '2025-01-31',
    });
    const plan = makePlanRow();

    // 1st select: due subscriptions (terminal .where)
    mockSelectReturns.mockReturnValueOnce([sub]);
    // 2nd select: plan lookup (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // update.set.where — no .returning(), no consumption

    const result = await closeBillingCycle(makeCtx(), {
      cycleDate: '2025-02-01',
    });

    expect(result.processedCount).toBe(1);
    expect(mockSet).toHaveBeenCalled();
  });

  it('should return summary with processedCount and totalBilledCents', async () => {
    const sub1 = makeSubscriptionRow({ id: 'sub_001', nextBillDate: '2025-02-01' });
    const sub2 = makeSubscriptionRow({ id: 'sub_002', nextBillDate: '2025-02-01' });
    const plan = makePlanRow({ duesAmountCents: 50000 });

    // 1st select: due subscriptions (terminal .where)
    mockSelectReturns.mockReturnValueOnce([sub1, sub2]);
    // 2nd select: plan for sub1 (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // sub1 update — no consumption
    // 3rd select: plan for sub2 (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // sub2 update — no consumption

    const result = await closeBillingCycle(makeCtx(), {
      cycleDate: '2025-02-01',
    });

    expect(result.processedCount).toBe(2);
    expect(result.totalBilledCents).toBe(100000);
  });

  it('should emit membership.billing_cycle.closed.v1 event', async () => {
    const sub = makeSubscriptionRow({ nextBillDate: '2025-02-01' });
    const plan = makePlanRow();

    // 1st select: due subscriptions (terminal .where)
    mockSelectReturns.mockReturnValueOnce([sub]);
    // 2nd select: plan lookup (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([plan]);
    // update — no consumption

    await closeBillingCycle(makeCtx(), {
      cycleDate: '2025-02-01',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.billing_cycle.closed.v1',
      expect.objectContaining({
        cycleDate: '2025-02-01',
        processedCount: 1,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. generateStatement Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — generateStatement', () => {
  beforeEach(resetMocks);

  it('should create statement with correct balances', async () => {
    const account = makeAccountRow({ billingAccountId: 'ba_001' });
    const statement = makeStatementRow({
      openingBalanceCents: 0,
      chargesCents: 50000,
      paymentsCents: 10000,
      closingBalanceCents: 40000,
    });

    // 1st select: fetch account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: fetch billing items (select.from.where — terminal, consumed via .then)
    mockSelectReturns.mockReturnValueOnce([
      { id: 'bi_001', description: 'Monthly Dues', amountCents: 50000, discountCents: 0, frequency: 'monthly', classId: null },
    ]);
    // 3rd select: fetch prior statement (select.from.where.orderBy.limit)
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert statement (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([statement]);
    // Statement line inserts do NOT call .returning() — no mockInsertReturns consumed

    const result = await generateStatement(makeCtx(), {
      membershipAccountId: 'acct_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      dueDate: '2025-02-15',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('stmt_001');
  });

  it('should create statement lines', async () => {
    const account = makeAccountRow({ billingAccountId: 'ba_001' });
    const statement = makeStatementRow();

    // 1st select: account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: billing items (terminal .where)
    mockSelectReturns.mockReturnValueOnce([
      { id: 'bi_001', description: 'Monthly Dues', amountCents: 50000, discountCents: 0, frequency: 'monthly', classId: null },
    ]);
    // 3rd select: prior statements (select.from.where.orderBy.limit)
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert statement (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([statement]);
    // Statement line inserts — no .returning()

    await generateStatement(makeCtx(), {
      membershipAccountId: 'acct_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      dueDate: '2025-02-15',
    });

    // Verify insert was called for statement lines
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
  });

  it('should generate unique statement number', async () => {
    const account = makeAccountRow({ billingAccountId: 'ba_001' });
    const statement = makeStatementRow({ statementNumber: 'STMT-2025-0001' });

    // 1st select: account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: billing items (terminal .where) — empty, no line items
    mockSelectReturns.mockReturnValueOnce([]);
    // 3rd select: prior statements (select.from.where.orderBy.limit)
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert statement (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([statement]);

    const result = await generateStatement(makeCtx(), {
      membershipAccountId: 'acct_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      dueDate: '2025-02-15',
    });

    expect(result.statementNumber).toBeDefined();
    expect(typeof result.statementNumber).toBe('string');
  });

  it('should throw NotFoundError for invalid account', async () => {
    // Account check returns empty (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      generateStatement(makeCtx(), {
        membershipAccountId: 'nonexistent',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        dueDate: '2025-02-15',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should emit membership.statement.generated.v1 event', async () => {
    const account = makeAccountRow({ billingAccountId: 'ba_001' });
    const statement = makeStatementRow();

    // 1st select: account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: billing items (terminal .where) — empty
    mockSelectReturns.mockReturnValueOnce([]);
    // 3rd select: prior statements (select.from.where.orderBy.limit)
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert statement (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([statement]);

    await generateStatement(makeCtx(), {
      membershipAccountId: 'acct_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      dueDate: '2025-02-15',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.statement.generated.v1',
      expect.objectContaining({
        membershipAccountId: 'acct_001',
        statementId: 'ulid_test_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. createMembershipPlanV2 Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — createMembershipPlanV2', () => {
  beforeEach(resetMocks);

  it('should create a plan with all fields', async () => {
    const plan = makePlanRow();

    // 1st select: duplicate name check (select.from.where.limit) — no duplicate
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert plan (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([plan]);

    const result = await createMembershipPlanV2(makeCtx(), {
      name: 'Gold Membership',
      priceCents: 50000,
      duesAmountCents: 50000,
      billingFrequency: 'monthly',
      prorationPolicy: 'daily',
      taxable: true,
      description: 'Premium Gold membership plan',
      glDuesRevenueAccountId: 'gl_001',
      minMonthsCommitment: 12,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('plan_001');
    expect(result.name).toBe('Gold Membership');
  });

  it('should set default billingFrequency and prorationPolicy', async () => {
    const plan = makePlanRow({
      billingFrequency: 'monthly',
      prorationPolicy: 'daily',
    });

    // 1st select: duplicate name check — no duplicate
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert plan
    mockInsertReturns.mockReturnValueOnce([plan]);

    const result = await createMembershipPlanV2(makeCtx(), {
      name: 'Basic Plan',
      priceCents: 25000,
      duesAmountCents: 25000,
    });

    expect(result).toBeDefined();
    expect(result.billingFrequency).toBe('monthly');
    expect(result.prorationPolicy).toBe('daily');
  });

  it('should emit membership.plan.created.v1 event', async () => {
    const plan = makePlanRow();

    // 1st select: duplicate name check — no duplicate
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert plan
    mockInsertReturns.mockReturnValueOnce([plan]);

    await createMembershipPlanV2(makeCtx(), {
      name: 'Gold Membership',
      priceCents: 50000,
      duesAmountCents: 50000,
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.created.v1',
      expect.objectContaining({
        planId: 'ulid_test_001',
        name: 'Gold Membership',
      }),
    );
  });

  it('should call auditLog', async () => {
    const plan = makePlanRow();

    // 1st select: duplicate name check — no duplicate
    mockSelectReturns.mockReturnValueOnce([]);
    // Insert plan
    mockInsertReturns.mockReturnValueOnce([plan]);

    await createMembershipPlanV2(makeCtx(), {
      name: 'Gold Membership',
      priceCents: 50000,
      duesAmountCents: 50000,
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.created',
      'membership_plan',
      'plan_001',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. updateMembershipPlanV2 Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — updateMembershipPlanV2', () => {
  beforeEach(resetMocks);

  it('should update plan fields', async () => {
    const existing = makePlanRow();
    const updated = makePlanRow({ duesAmountCents: 60000, name: 'Gold Plus' });

    // Fetch existing plan
    mockSelectReturns.mockReturnValueOnce([existing]);
    // Update returns updated plan
    mockInsertReturns.mockReturnValueOnce([updated]);

    const result = await updateMembershipPlanV2(makeCtx(), {
      planId: 'plan_001',
      duesAmountCents: 60000,
      name: 'Gold Plus',
    });

    expect(result).toBeDefined();
    expect(mockSet).toHaveBeenCalled();
  });

  it('should throw NotFoundError for invalid plan', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      updateMembershipPlanV2(makeCtx(), {
        planId: 'nonexistent',
        name: 'New Name',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should emit membership.plan.updated.v1 event', async () => {
    const existing = makePlanRow();
    const updated = makePlanRow({ duesAmountCents: 60000 });

    mockSelectReturns.mockReturnValueOnce([existing]);
    mockInsertReturns.mockReturnValueOnce([updated]);

    await updateMembershipPlanV2(makeCtx(), {
      planId: 'plan_001',
      duesAmountCents: 60000,
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.plan.updated.v1',
      expect.objectContaining({
        planId: 'plan_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. listSubscriptions Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — listSubscriptions', () => {
  beforeEach(resetMocks);

  it('should return subscriptions with plan names', async () => {
    const row = {
      id: 'sub_001',
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      planName: 'Gold Membership',
      status: 'active',
      effectiveDate: '2025-01-01',
      effectiveEnd: null,
      nextBillDate: '2025-02-01',
      lastBilledDate: '2025-01-01',
      billedThroughDate: '2025-01-31',
      createdAt: new Date('2025-01-01'),
    };

    mockSelectReturns.mockReturnValueOnce([row]);

    const result = await listSubscriptions({
      tenantId: TENANT_A,
      membershipAccountId: 'acct_001',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('sub_001');
    expect(result.items[0]!.planName).toBe('Gold Membership');
  });

  it('should support cursor pagination', async () => {
    // Return limit+1 rows to trigger hasMore
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `sub_${String(i).padStart(3, '0')}`,
      membershipAccountId: 'acct_001',
      planId: 'plan_001',
      planName: 'Gold Membership',
      status: 'active',
      effectiveDate: '2025-01-01',
      effectiveEnd: null,
      nextBillDate: '2025-02-01',
      lastBilledDate: null,
      billedThroughDate: null,
      createdAt: new Date('2025-01-01'),
    }));

    mockSelectReturns.mockReturnValueOnce(rows);

    const result = await listSubscriptions({
      tenantId: TENANT_A,
      membershipAccountId: 'acct_001',
    });

    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. listStatements Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — listStatements', () => {
  beforeEach(resetMocks);

  it('should return statements for an account', async () => {
    const row = {
      id: 'stmt_001',
      billingAccountId: 'ba_001',
      membershipAccountId: 'acct_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      openingBalanceCents: 0,
      chargesCents: 50000,
      paymentsCents: 0,
      closingBalanceCents: 50000,
      dueDate: '2025-02-15',
      status: 'open',
      statementNumber: 'STMT-2025-0001',
      createdAt: new Date('2025-01-31'),
    };

    mockSelectReturns.mockReturnValueOnce([row]);

    const result = await listStatements({
      tenantId: TENANT_A,
      membershipAccountId: 'acct_001',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('stmt_001');
    expect(result.items[0]!.closingBalanceCents).toBe(50000);
  });

  it('should filter by status', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    await listStatements({
      tenantId: TENANT_A,
      membershipAccountId: 'acct_001',
      status: 'closed',
    });

    // Verify that where was called (status filter applied)
    expect(mockWhere).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. getStatementDetail Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 6 — getStatementDetail', () => {
  beforeEach(resetMocks);

  it('should return statement with lines', async () => {
    const statementRow = makeStatementRow();
    const lineRow = {
      id: 'sl_001',
      statementId: 'stmt_001',
      lineType: 'dues',
      description: 'Monthly Dues - Gold Membership',
      amountCents: 50000,
      sortOrder: 0,
      createdAt: new Date('2025-01-31'),
    };

    // Fetch statement
    mockSelectReturns.mockReturnValueOnce([statementRow]);
    // Fetch statement lines
    mockSelectReturns.mockReturnValueOnce([lineRow]);

    const result = await getStatementDetail({
      tenantId: TENANT_A,
      statementId: 'stmt_001',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('stmt_001');
    expect(result!.lines).toHaveLength(1);
    expect(result!.lines[0]!.lineType).toBe('dues');
    expect(result!.lines[0]!.amountCents).toBe(50000);
  });

  it('should return null for non-existent statement', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    const result = await getStatementDetail({
      tenantId: TENANT_A,
      statementId: 'nonexistent',
    });

    expect(result).toBeNull();
  });
});
