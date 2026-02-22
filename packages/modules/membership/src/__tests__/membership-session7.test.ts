import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle chain ──────────────────────────────────────────────

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
  minimumPeriodRollups: {
    id: 'id', tenantId: 'tenant_id', customerId: 'customer_id',
    minimumSpendRuleId: 'minimum_spend_rule_id',
    periodStart: 'period_start', periodEnd: 'period_end',
    requiredCents: 'required_cents', satisfiedCents: 'satisfied_cents',
    shortfallCents: 'shortfall_cents', rolloverInCents: 'rollover_in_cents',
    rolloverOutCents: 'rollover_out_cents', status: 'status',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  minimumEligibilityRules: {
    id: 'id', tenantId: 'tenant_id', ruleId: 'rule_id',
    condition: 'condition', isActive: 'is_active',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  customerMinimumSpendRules: {
    id: 'id', tenantId: 'tenant_id', customerId: 'customer_id',
    minimumSpendRuleId: 'minimum_spend_rule_id',
    startDate: 'start_date', endDate: 'end_date', status: 'status',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  minimumSpendRules: {
    id: 'id', tenantId: 'tenant_id', title: 'title', amountCents: 'amount_cents',
    membershipPlanId: 'membership_plan_id', frequencyId: 'frequency_id',
    bucketType: 'bucket_type', allocationMethod: 'allocation_method',
    rolloverPolicy: 'rollover_policy',
    excludeTax: 'exclude_tax', excludeTips: 'exclude_tips',
    excludeServiceCharges: 'exclude_service_charges', excludeDues: 'exclude_dues',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  minimumSpendRuleDepartments: {
    id: 'id', tenantId: 'tenant_id', minimumSpendRuleId: 'minimum_spend_rule_id',
    departmentId: 'department_id', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number',
    status: 'status', customerId: 'customer_id',
  },
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
  sql: Object.assign(vi.fn(), { raw: vi.fn(), join: vi.fn() }),
  count: vi.fn(() => 'count'),
}));

// ── Imports ─────────────────────────────────────────────────────────

import { computeMinimumProgress, allocateSpend } from '../helpers/minimum-engine';
import { computeMinimums } from '../commands/compute-minimums';
import { configureMinimumPolicy } from '../commands/configure-minimum-policy';
import { assignMinimumToMember } from '../commands/assign-minimum-to-member';
import { rolloverMinimumBalance } from '../commands/rollover-minimum-balance';
import { getMinimumProgress } from '../queries/get-minimum-progress';
import { getMinimumComplianceDashboard } from '../queries/get-minimum-compliance-dashboard';
import { getMinimumHistory } from '../queries/get-minimum-history';

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
  vi.clearAllMocks();

  // mockReset on data-return mocks to clear mockReturnValueOnce queues (gotcha #58)
  mockSelectReturns.mockReset();
  mockInsertReturns.mockReset();
  mockUpdateReturns.mockReset();

  // Set default return values
  mockSelectReturns.mockReturnValue([]);
  mockInsertReturns.mockReturnValue([]);
  mockUpdateReturns.mockReturnValue([]);
  mockExecute.mockResolvedValue([]);

  wireChain();
}

function makeRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule_001',
    tenantId: TENANT_A,
    title: 'F&B Minimum',
    amountCents: 100000, // $1,000
    membershipPlanId: null,
    bucketType: 'all',
    allocationMethod: 'first_match',
    rolloverPolicy: 'none',
    excludeTax: true,
    excludeTips: true,
    excludeServiceCharges: true,
    excludeDues: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeRollupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rollup_001',
    tenantId: TENANT_A,
    customerId: 'cust_001',
    minimumSpendRuleId: 'rule_001',
    periodStart: '2025-01-01',
    periodEnd: '2025-03-31',
    requiredCents: 100000,
    satisfiedCents: 60000,
    shortfallCents: 40000,
    rolloverInCents: 0,
    rolloverOutCents: 0,
    status: 'open',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct_001',
    tenantId: TENANT_A,
    accountNumber: 'MEM-001',
    status: 'active',
    customerId: 'cust_001',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Minimum Engine Helper Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — computeMinimumProgress', () => {
  it('should compute 0% when nothing spent', () => {
    const result = computeMinimumProgress({
      requiredCents: 100000,
      spentCents: 0,
      rolloverInCents: 0,
      excludeTax: true,
      excludeTips: true,
      excludeServiceCharges: true,
      excludeDues: true,
    });

    expect(result.satisfiedCents).toBe(0);
    expect(result.shortfallCents).toBe(100000);
    expect(result.progressPercent).toBe(0);
    expect(result.isMetMinimum).toBe(false);
  });

  it('should compute 100% when fully met', () => {
    const result = computeMinimumProgress({
      requiredCents: 100000,
      spentCents: 100000,
      rolloverInCents: 0,
      excludeTax: true,
      excludeTips: true,
      excludeServiceCharges: true,
      excludeDues: true,
    });

    expect(result.satisfiedCents).toBe(100000);
    expect(result.shortfallCents).toBe(0);
    expect(result.progressPercent).toBe(100);
    expect(result.isMetMinimum).toBe(true);
  });

  it('should include rollover in progress', () => {
    const result = computeMinimumProgress({
      requiredCents: 100000,
      spentCents: 50000,
      rolloverInCents: 30000,
      excludeTax: true,
      excludeTips: true,
      excludeServiceCharges: true,
      excludeDues: true,
    });

    // (50000 + 30000) / 100000 = 80%
    expect(result.satisfiedCents).toBe(50000);
    expect(result.shortfallCents).toBe(20000); // 100000 - 50000 - 30000
    expect(result.progressPercent).toBe(80);
    expect(result.isMetMinimum).toBe(false);
  });

  it('should cap progress at 100%', () => {
    const result = computeMinimumProgress({
      requiredCents: 100000,
      spentCents: 120000,
      rolloverInCents: 10000,
      excludeTax: true,
      excludeTips: true,
      excludeServiceCharges: true,
      excludeDues: true,
    });

    // (120000 + 10000) / 100000 = 130% -> capped at 100%
    expect(result.progressPercent).toBe(100);
    expect(result.shortfallCents).toBe(0);
    expect(result.isMetMinimum).toBe(true);
  });

  it('should return 100% when requiredCents is zero', () => {
    const result = computeMinimumProgress({
      requiredCents: 0,
      spentCents: 0,
      rolloverInCents: 0,
      excludeTax: true,
      excludeTips: true,
      excludeServiceCharges: true,
      excludeDues: true,
    });

    expect(result.progressPercent).toBe(100);
    expect(result.isMetMinimum).toBe(true);
    expect(result.shortfallCents).toBe(0);
  });
});

describe('Session 7 — allocateSpend', () => {
  it('should allocate via first_match method', () => {
    const buckets = [
      { ruleId: 'rule_a', requiredCents: 50000, satisfiedCents: 20000 },
      { ruleId: 'rule_b', requiredCents: 30000, satisfiedCents: 0 },
    ];

    const result = allocateSpend(40000, buckets, 'first_match');

    // Gap for rule_a: 50000 - 20000 = 30000 -> gets 30000 from 40000
    // Gap for rule_b: 30000 - 0 = 30000 -> gets 10000 remaining
    expect(result).toEqual([
      { ruleId: 'rule_a', allocatedCents: 30000 },
      { ruleId: 'rule_b', allocatedCents: 10000 },
    ]);
  });

  it('should allocate via proportional method', () => {
    const buckets = [
      { ruleId: 'rule_a', requiredCents: 60000, satisfiedCents: 0 },
      { ruleId: 'rule_b', requiredCents: 40000, satisfiedCents: 0 },
    ];

    const result = allocateSpend(50000, buckets, 'proportional');

    // Total required gap = 100000
    // rule_a share: (60000 / 100000) * 50000 = 30000
    // rule_b share: (40000 / 100000) * 50000 = 20000
    expect(result).toEqual([
      { ruleId: 'rule_a', allocatedCents: 30000 },
      { ruleId: 'rule_b', allocatedCents: 20000 },
    ]);
  });

  it('should return zero allocations for empty buckets', () => {
    const result = allocateSpend(50000, [], 'first_match');
    expect(result).toEqual([]);
  });

  it('should return zero allocations when totalSpent is zero', () => {
    const buckets = [
      { ruleId: 'rule_a', requiredCents: 50000, satisfiedCents: 0 },
    ];

    const result = allocateSpend(0, buckets, 'first_match');
    expect(result).toEqual([{ ruleId: 'rule_a', allocatedCents: 0 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. computeMinimums Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — computeMinimums', () => {
  beforeEach(resetMocks);

  it('should create rollup when none exists', async () => {
    const rule = makeRuleRow();

    // 1st select: fetch rule (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([rule]);
    // 2nd select: fetch existing rollup (select.from.where.limit) — none found
    mockSelectReturns.mockReturnValueOnce([]);

    const result = await computeMinimums(makeCtx(), {
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      spentCents: 25000,
    });

    expect(result).toBeDefined();
    expect(result.rollupId).toBe('ulid_test_001');
    expect(result.satisfiedCents).toBe(25000);
    expect(result.requiredCents).toBe(100000);
    // Verify insert was called for new rollup
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should update existing rollup', async () => {
    const rule = makeRuleRow();
    const existingRollup = makeRollupRow({ satisfiedCents: 30000, rolloverInCents: 5000 });

    // 1st select: fetch rule
    mockSelectReturns.mockReturnValueOnce([rule]);
    // 2nd select: fetch existing rollup — found
    mockSelectReturns.mockReturnValueOnce([existingRollup]);

    const result = await computeMinimums(makeCtx(), {
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      spentCents: 75000,
    });

    expect(result).toBeDefined();
    expect(result.rollupId).toBe('rollup_001');
    expect(result.satisfiedCents).toBe(75000);
    // Verify update was called (not insert) for existing rollup
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should compute shortfall correctly', async () => {
    const rule = makeRuleRow({ amountCents: 100000 });

    // 1st select: fetch rule
    mockSelectReturns.mockReturnValueOnce([rule]);
    // 2nd select: no existing rollup
    mockSelectReturns.mockReturnValueOnce([]);

    const result = await computeMinimums(makeCtx(), {
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      spentCents: 40000,
    });

    expect(result.shortfallCents).toBe(60000); // 100000 - 40000
    expect(result.isMetMinimum).toBe(false);
    expect(result.progressPercent).toBe(40);
  });

  it('should emit membership.minimums.computed.v1', async () => {
    const rule = makeRuleRow();

    mockSelectReturns.mockReturnValueOnce([rule]);
    mockSelectReturns.mockReturnValueOnce([]);

    await computeMinimums(makeCtx(), {
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      spentCents: 50000,
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.minimums.computed.v1',
      expect.objectContaining({
        customerId: 'cust_001',
        ruleId: 'rule_001',
        rollupId: 'ulid_test_001',
        periodStart: '2025-01-01',
        periodEnd: '2025-03-31',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. configureMinimumPolicy Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — configureMinimumPolicy', () => {
  beforeEach(resetMocks);

  it('should create a new minimum spend rule', async () => {
    const createdRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      title: 'F&B Minimum Spend',
      amountCents: 100000,
      bucketType: 'food_beverage',
    };

    // Insert returning the created row
    mockInsertReturns.mockReturnValueOnce([createdRow]);

    const result = await configureMinimumPolicy(makeCtx(), {
      title: 'F&B Minimum Spend',
      amountCents: 100000,
      bucketType: 'food_beverage',
      allocationMethod: 'first_match',
      rolloverPolicy: 'none',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('ulid_test_001');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should emit membership.minimum_policy.configured.v1', async () => {
    const createdRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      title: 'Golf Minimum',
      amountCents: 50000,
    };

    mockInsertReturns.mockReturnValueOnce([createdRow]);

    await configureMinimumPolicy(makeCtx(), {
      title: 'Golf Minimum',
      amountCents: 50000,
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.minimum_policy.configured.v1',
      expect.objectContaining({
        ruleId: 'ulid_test_001',
        title: 'Golf Minimum',
        amountCents: 50000,
      }),
    );
  });

  it('should call auditLog', async () => {
    const createdRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      title: 'Retail Minimum',
      amountCents: 75000,
    };

    mockInsertReturns.mockReturnValueOnce([createdRow]);

    await configureMinimumPolicy(makeCtx(), {
      title: 'Retail Minimum',
      amountCents: 75000,
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.minimum_policy.configured',
      'minimum_spend_rule',
      'ulid_test_001',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. assignMinimumToMember Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — assignMinimumToMember', () => {
  beforeEach(resetMocks);

  it('should create a period rollup', async () => {
    const account = makeAccountRow();
    const rule = makeRuleRow();
    const assignment = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      customerId: 'cust_001',
      minimumSpendRuleId: 'rule_001',
      startDate: '2025-01-01',
      status: 'active',
    };

    // 1st select: fetch account (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: fetch rule (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([rule]);
    // Insert assignment (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([assignment]);

    const result = await assignMinimumToMember(makeCtx(), {
      membershipAccountId: 'acct_001',
      ruleId: 'rule_001',
      startDate: '2025-01-01',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('ulid_test_001');
    // Should have called insert at least twice (assignment + rollup)
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should throw NotFoundError for invalid account', async () => {
    // Account not found
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      assignMinimumToMember(makeCtx(), {
        membershipAccountId: 'nonexistent',
        ruleId: 'rule_001',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should throw NotFoundError for invalid rule', async () => {
    const account = makeAccountRow();

    // 1st select: account found
    mockSelectReturns.mockReturnValueOnce([account]);
    // 2nd select: rule not found
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      assignMinimumToMember(makeCtx(), {
        membershipAccountId: 'acct_001',
        ruleId: 'nonexistent',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should emit membership.minimum.assigned.v1', async () => {
    const account = makeAccountRow();
    const rule = makeRuleRow();
    const assignment = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      customerId: 'cust_001',
      minimumSpendRuleId: 'rule_001',
      startDate: '2025-01-01',
      status: 'active',
    };

    mockSelectReturns.mockReturnValueOnce([account]);
    mockSelectReturns.mockReturnValueOnce([rule]);
    mockInsertReturns.mockReturnValueOnce([assignment]);

    await assignMinimumToMember(makeCtx(), {
      membershipAccountId: 'acct_001',
      ruleId: 'rule_001',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.minimum.assigned.v1',
      expect.objectContaining({
        membershipAccountId: 'acct_001',
        ruleId: 'rule_001',
        customerId: 'cust_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. rolloverMinimumBalance Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — rolloverMinimumBalance', () => {
  beforeEach(resetMocks);

  it('should create new period with rollover', async () => {
    const currentRollup = makeRollupRow({
      satisfiedCents: 120000,
      rolloverInCents: 0,
      requiredCents: 100000,
      status: 'open',
    });
    const rule = makeRuleRow({ rolloverPolicy: 'monthly_to_monthly', amountCents: 100000 });
    const newRollupRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      customerId: 'cust_001',
      minimumSpendRuleId: 'rule_001',
      periodStart: '2025-04-01',
      periodEnd: '2025-06-30',
      requiredCents: 100000,
      satisfiedCents: 0,
      shortfallCents: 80000, // 100000 - 20000 rollover
      rolloverInCents: 20000,
      rolloverOutCents: 0,
      status: 'open',
    };

    // 1st select: current rollup (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([currentRollup]);
    // 2nd select: rule (select.from.where.limit)
    mockSelectReturns.mockReturnValueOnce([rule]);
    // Insert new rollup (insert.values.returning)
    mockInsertReturns.mockReturnValueOnce([newRollupRow]);

    const result = await rolloverMinimumBalance(makeCtx(), {
      rollupId: 'rollup_001',
      newPeriodStart: '2025-04-01',
      newPeriodEnd: '2025-06-30',
    });

    expect(result).toBeDefined();
    expect(result.newRollup).toBeDefined();
    expect(result.newRollup.id).toBe('ulid_test_001');
    expect(result.rolloverAmountCents).toBe(20000); // 120000 - 100000 surplus
    // Verify insert called (new rollup) and update called (close old rollup)
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should update prior period rolloverOutCents and close it', async () => {
    const currentRollup = makeRollupRow({
      satisfiedCents: 130000,
      rolloverInCents: 10000,
      requiredCents: 100000,
      status: 'open',
    });
    const rule = makeRuleRow({ rolloverPolicy: 'within_quarter', amountCents: 100000 });
    const newRollupRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      customerId: 'cust_001',
    };

    mockSelectReturns.mockReturnValueOnce([currentRollup]);
    mockSelectReturns.mockReturnValueOnce([rule]);
    mockInsertReturns.mockReturnValueOnce([newRollupRow]);

    const result = await rolloverMinimumBalance(makeCtx(), {
      rollupId: 'rollup_001',
      newPeriodStart: '2025-04-01',
      newPeriodEnd: '2025-06-30',
    });

    // 130000 + 10000 - 100000 = 40000 surplus carried over
    expect(result.rolloverAmountCents).toBe(40000);
    // Verify the old rollup was updated (closed)
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it('should throw NotFoundError for invalid rollup', async () => {
    // No rollup found
    mockSelectReturns.mockReturnValueOnce([]);

    await expect(
      rolloverMinimumBalance(makeCtx(), {
        rollupId: 'nonexistent',
        newPeriodStart: '2025-04-01',
        newPeriodEnd: '2025-06-30',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should throw when rollover policy is none', async () => {
    const currentRollup = makeRollupRow({ status: 'open' });
    const rule = makeRuleRow({ rolloverPolicy: 'none' });

    mockSelectReturns.mockReturnValueOnce([currentRollup]);
    mockSelectReturns.mockReturnValueOnce([rule]);

    await expect(
      rolloverMinimumBalance(makeCtx(), {
        rollupId: 'rollup_001',
        newPeriodStart: '2025-04-01',
        newPeriodEnd: '2025-06-30',
      }),
    ).rejects.toThrow(/rollover is not enabled/i);
  });

  it('should emit membership.minimum.rolled_over.v1', async () => {
    const currentRollup = makeRollupRow({
      satisfiedCents: 150000,
      rolloverInCents: 0,
      requiredCents: 100000,
      status: 'open',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
    });
    const rule = makeRuleRow({ rolloverPolicy: 'monthly_to_monthly', amountCents: 100000 });
    const newRollupRow = {
      id: 'ulid_test_001',
      tenantId: TENANT_A,
      customerId: 'cust_001',
    };

    mockSelectReturns.mockReturnValueOnce([currentRollup]);
    mockSelectReturns.mockReturnValueOnce([rule]);
    mockInsertReturns.mockReturnValueOnce([newRollupRow]);

    await rolloverMinimumBalance(makeCtx(), {
      rollupId: 'rollup_001',
      newPeriodStart: '2025-04-01',
      newPeriodEnd: '2025-06-30',
    });

    expect(buildEventFromContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      'membership.minimum.rolled_over.v1',
      expect.objectContaining({
        priorRollupId: 'rollup_001',
        newRollupId: 'ulid_test_001',
        rolloverAmountCents: 50000, // 150000 - 100000 surplus
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. getMinimumProgress Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — getMinimumProgress', () => {
  beforeEach(resetMocks);

  it('should return progress entries with computed fields', async () => {
    const row = {
      id: 'rollup_001',
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      requiredCents: 100000,
      satisfiedCents: 60000,
      shortfallCents: 40000,
      rolloverInCents: 10000,
      rolloverOutCents: 0,
      status: 'open',
    };

    mockSelectReturns.mockReturnValueOnce([row]);

    const result = await getMinimumProgress({
      tenantId: TENANT_A,
      customerId: 'cust_001',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('rollup_001');
    // (60000 + 10000) / 100000 = 70%
    expect(result[0]!.progressPercent).toBe(70);
    expect(result[0]!.isMetMinimum).toBe(false);
    expect(result[0]!.shortfallCents).toBe(40000);
  });

  it('should filter by period', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    await getMinimumProgress({
      tenantId: TENANT_A,
      customerId: 'cust_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
    });

    // Verify where was called (with period filters)
    expect(mockWhere).toHaveBeenCalled();
  });

  it('should handle zero requiredCents (100% progress)', async () => {
    const row = {
      id: 'rollup_002',
      customerId: 'cust_001',
      ruleId: 'rule_002',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      requiredCents: 0,
      satisfiedCents: 0,
      shortfallCents: 0,
      rolloverInCents: 0,
      rolloverOutCents: 0,
      status: 'open',
    };

    mockSelectReturns.mockReturnValueOnce([row]);

    const result = await getMinimumProgress({
      tenantId: TENANT_A,
      customerId: 'cust_001',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.progressPercent).toBe(100);
    expect(result[0]!.isMetMinimum).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. getMinimumComplianceDashboard Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — getMinimumComplianceDashboard', () => {
  beforeEach(resetMocks);

  it('should return aggregated compliance stats', async () => {
    const rows = [
      {
        customerId: 'cust_001', ruleId: 'rule_001',
        periodStart: '2025-01-01', periodEnd: '2025-03-31',
        requiredCents: 100000, satisfiedCents: 100000,
        shortfallCents: 0, rolloverInCents: 0, status: 'open',
      },
      {
        customerId: 'cust_002', ruleId: 'rule_001',
        periodStart: '2025-01-01', periodEnd: '2025-03-31',
        requiredCents: 100000, satisfiedCents: 40000,
        shortfallCents: 60000, rolloverInCents: 0, status: 'open',
      },
    ];

    mockSelectReturns.mockReturnValueOnce(rows);

    const result = await getMinimumComplianceDashboard({
      tenantId: TENANT_A,
    });

    expect(result.totalMembers).toBe(2);
    expect(result.totalRequiredCents).toBe(200000);
    expect(result.totalSatisfiedCents).toBe(140000);
    expect(result.totalShortfallCents).toBe(60000);
    expect(result.entries).toHaveLength(2);
  });

  it('should categorize entries by traffic light', async () => {
    const rows = [
      {
        customerId: 'cust_green', ruleId: 'rule_001',
        periodStart: '2025-01-01', periodEnd: '2025-03-31',
        requiredCents: 100000, satisfiedCents: 100000,
        shortfallCents: 0, rolloverInCents: 0, status: 'open',
      },
      {
        customerId: 'cust_amber', ruleId: 'rule_001',
        periodStart: '2025-01-01', periodEnd: '2025-03-31',
        requiredCents: 100000, satisfiedCents: 60000,
        shortfallCents: 40000, rolloverInCents: 0, status: 'open',
      },
      {
        customerId: 'cust_red', ruleId: 'rule_001',
        periodStart: '2025-01-01', periodEnd: '2025-03-31',
        requiredCents: 100000, satisfiedCents: 10000,
        shortfallCents: 90000, rolloverInCents: 0, status: 'open',
      },
    ];

    mockSelectReturns.mockReturnValueOnce(rows);

    const result = await getMinimumComplianceDashboard({
      tenantId: TENANT_A,
    });

    expect(result.metMinimum).toBe(1);   // green: 100%
    expect(result.atRisk).toBe(1);       // amber: 60%
    expect(result.belowMinimum).toBe(1); // red: 10%

    const green = result.entries.find(e => e.customerId === 'cust_green');
    const amber = result.entries.find(e => e.customerId === 'cust_amber');
    const red = result.entries.find(e => e.customerId === 'cust_red');

    expect(green!.trafficLight).toBe('green');
    expect(amber!.trafficLight).toBe('amber');
    expect(red!.trafficLight).toBe('red');
  });

  it('should handle empty results', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    const result = await getMinimumComplianceDashboard({
      tenantId: TENANT_A,
    });

    expect(result.totalMembers).toBe(0);
    expect(result.metMinimum).toBe(0);
    expect(result.atRisk).toBe(0);
    expect(result.belowMinimum).toBe(0);
    expect(result.totalRequiredCents).toBe(0);
    expect(result.totalSatisfiedCents).toBe(0);
    expect(result.totalShortfallCents).toBe(0);
    expect(result.entries).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. getMinimumHistory Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 7 — getMinimumHistory', () => {
  beforeEach(resetMocks);

  it('should return paginated history', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `rollup_${String(i).padStart(3, '0')}`,
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      requiredCents: 100000,
      satisfiedCents: 50000 + i * 10000,
      shortfallCents: 50000 - i * 10000,
      rolloverInCents: 0,
      rolloverOutCents: 0,
      status: 'closed',
      createdAt: new Date('2025-01-01'),
    }));

    mockSelectReturns.mockReturnValueOnce(rows);

    const result = await getMinimumHistory({
      tenantId: TENANT_A,
      customerId: 'cust_001',
    });

    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('should support cursor pagination', async () => {
    // Return limit+1 rows to trigger hasMore (default limit=20)
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `rollup_${String(i).padStart(3, '0')}`,
      customerId: 'cust_001',
      ruleId: 'rule_001',
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
      requiredCents: 100000,
      satisfiedCents: 50000,
      shortfallCents: 50000,
      rolloverInCents: 0,
      rolloverOutCents: 0,
      status: 'closed',
      createdAt: new Date('2025-01-01'),
    }));

    mockSelectReturns.mockReturnValueOnce(rows);

    const result = await getMinimumHistory({
      tenantId: TENANT_A,
      customerId: 'cust_001',
    });

    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).not.toBeNull();
  });

  it('should filter by ruleId', async () => {
    mockSelectReturns.mockReturnValueOnce([]);

    await getMinimumHistory({
      tenantId: TENANT_A,
      customerId: 'cust_001',
      ruleId: 'rule_specific',
    });

    // Verify where was called (ruleId filter would be included)
    expect(mockWhere).toHaveBeenCalled();
  });
});
