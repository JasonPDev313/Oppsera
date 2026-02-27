import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockSelect,
} = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockSelect = vi.fn(() => makeSelectChain());
  return { mockSelect, makeSelectChain };
});

vi.mock('@oppsera/db', () => ({
  customers: {
    id: 'id', tenantId: 'tenant_id', totalVisits: 'total_visits',
    totalSpend: 'total_spend', lastVisitAt: 'last_visit_at', createdAt: 'created_at',
    status: 'status', type: 'type', email: 'email', phone: 'phone',
    marketingConsent: 'marketing_consent', taxExempt: 'tax_exempt',
    dateOfBirth: 'date_of_birth', loyaltyPointsBalance: 'loyalty_points_balance',
    walletBalanceCents: 'wallet_balance_cents',
  },
  customerMemberships: { tenantId: 'tenant_id', customerId: 'customer_id', status: 'status', planId: 'plan_id', createdAt: 'created_at' },
  billingAccounts: { id: 'id', tenantId: 'tenant_id', primaryCustomerId: 'primary_customer_id', collectionStatus: 'collection_status' },
  customerIncidents: { tenantId: 'tenant_id', customerId: 'customer_id', status: 'status' },
  customerVisits: { tenantId: 'tenant_id', customerId: 'customer_id', checkInAt: 'check_in_at' },
  customerTags: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', tagId: 'tag_id', removedAt: 'removed_at' },
  customerScores: { tenantId: 'tenant_id', customerId: 'customer_id', scoreType: 'score_type', score: 'score', metadata: 'metadata' },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'test-ulid'),
  SCORE_TYPES: {
    RFM: 'rfm', RFM_RECENCY: 'rfm_recency', RFM_FREQUENCY: 'rfm_frequency',
    RFM_MONETARY: 'rfm_monetary', CHURN_RISK: 'churn_risk',
    PREDICTED_CLV: 'predicted_clv', SPEND_VELOCITY: 'spend_velocity',
    DAYS_UNTIL_PREDICTED_VISIT: 'days_until_predicted_visit',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: unknown[]) => ({ type: 'eq', args: a })),
  and: vi.fn((...a: unknown[]) => ({ type: 'and', args: a })),
  isNull: vi.fn((a: unknown) => ({ type: 'isNull', arg: a })),
  sql: Object.assign(vi.fn((...a: unknown[]) => ({ type: 'sql', args: a })), {
    join: vi.fn(() => ({ type: 'sql.join' })),
  }),
  gte: vi.fn((...a: unknown[]) => ({ type: 'gte', args: a })),
  desc: vi.fn((a: unknown) => ({ type: 'desc', arg: a })),
}));

// ── Imports ─────────────────────────────────────────────────────

import {
  evaluateCondition,
  evaluateConditionGroup,
  evaluateAllGroups,
  extractNeededMetrics,
  buildEvidence,
  evaluateCustomerForRule,
} from '../services/smart-tag-evaluator';
import type { SmartTagConditionGroup } from '../types/smart-tag-conditions';

// ── Helpers ─────────────────────────────────────────────────────

function makeSelectChain(result: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function makeTx() {
  return { select: mockSelect };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockSelect.mockImplementation(() => makeSelectChain());
});

// ═══════════════════════════════════════════════════════════════════
// evaluateCondition — pure function
// ═══════════════════════════════════════════════════════════════════

describe('evaluateCondition', () => {
  // Numeric comparisons
  it('gt: 10 > 5 → true', () => {
    expect(evaluateCondition(10, 'gt', 5)).toBe(true);
  });
  it('gt: 5 > 10 → false', () => {
    expect(evaluateCondition(5, 'gt', 10)).toBe(false);
  });
  it('gt: 5 > 5 → false (strict)', () => {
    expect(evaluateCondition(5, 'gt', 5)).toBe(false);
  });
  it('gte: 5 >= 5 → true', () => {
    expect(evaluateCondition(5, 'gte', 5)).toBe(true);
  });
  it('gte: 4 >= 5 → false', () => {
    expect(evaluateCondition(4, 'gte', 5)).toBe(false);
  });
  it('lt: 3 < 5 → true', () => {
    expect(evaluateCondition(3, 'lt', 5)).toBe(true);
  });
  it('lt: 5 < 5 → false (strict)', () => {
    expect(evaluateCondition(5, 'lt', 5)).toBe(false);
  });
  it('lte: 5 <= 5 → true', () => {
    expect(evaluateCondition(5, 'lte', 5)).toBe(true);
  });
  it('lte: 6 <= 5 → false', () => {
    expect(evaluateCondition(6, 'lte', 5)).toBe(false);
  });

  // Equality
  it('eq: 42 = 42 → true', () => {
    expect(evaluateCondition(42, 'eq', 42)).toBe(true);
  });
  it('eq: 42 = 43 → false', () => {
    expect(evaluateCondition(42, 'eq', 43)).toBe(false);
  });
  it('neq: 42 != 43 → true', () => {
    expect(evaluateCondition(42, 'neq', 43)).toBe(true);
  });
  it('neq: 42 != 42 → false', () => {
    expect(evaluateCondition(42, 'neq', 42)).toBe(false);
  });

  // String equality
  it('eq: string comparison', () => {
    expect(evaluateCondition('active', 'eq', 'active')).toBe(true);
    expect(evaluateCondition('active', 'eq', 'inactive')).toBe(false);
  });
  it('neq: string comparison', () => {
    expect(evaluateCondition('active', 'neq', 'inactive')).toBe(true);
  });

  // Boolean
  it('eq: boolean comparison', () => {
    expect(evaluateCondition(true, 'eq', true)).toBe(true);
    expect(evaluateCondition(true, 'eq', false)).toBe(false);
    expect(evaluateCondition(false, 'neq', true)).toBe(true);
  });

  // Between
  it('between: value in range → true', () => {
    expect(evaluateCondition(50, 'between', [10, 100])).toBe(true);
  });
  it('between: value at boundaries → true', () => {
    expect(evaluateCondition(10, 'between', [10, 100])).toBe(true);
    expect(evaluateCondition(100, 'between', [10, 100])).toBe(true);
  });
  it('between: value outside range → false', () => {
    expect(evaluateCondition(5, 'between', [10, 100])).toBe(false);
    expect(evaluateCondition(101, 'between', [10, 100])).toBe(false);
  });

  // Set operations
  it('in: value in list → true', () => {
    expect(evaluateCondition('active', 'in', ['active', 'suspended'])).toBe(true);
  });
  it('in: value not in list → false', () => {
    expect(evaluateCondition('deleted', 'in', ['active', 'suspended'])).toBe(false);
  });
  it('not_in: value not in list → true', () => {
    expect(evaluateCondition('deleted', 'not_in', ['active', 'suspended'])).toBe(true);
  });
  it('not_in: value in list → false', () => {
    expect(evaluateCondition('active', 'not_in', ['active', 'suspended'])).toBe(false);
  });

  // Contains (case-insensitive)
  it('contains: substring match', () => {
    expect(evaluateCondition('Champions', 'contains', 'champ')).toBe(true);
    expect(evaluateCondition('Champions', 'contains', 'CHAMP')).toBe(true);
    expect(evaluateCondition('Champions', 'contains', 'loser')).toBe(false);
  });

  // Null checks
  it('is_null: null → true', () => {
    expect(evaluateCondition(null, 'is_null', null)).toBe(true);
    expect(evaluateCondition(undefined, 'is_null', null)).toBe(true);
  });
  it('is_null: non-null → false', () => {
    expect(evaluateCondition(42, 'is_null', null)).toBe(false);
    expect(evaluateCondition('', 'is_null', null)).toBe(false);
  });
  it('is_not_null: non-null → true', () => {
    expect(evaluateCondition(42, 'is_not_null', null)).toBe(true);
    expect(evaluateCondition(0, 'is_not_null', null)).toBe(true);
  });
  it('is_not_null: null → false', () => {
    expect(evaluateCondition(null, 'is_not_null', null)).toBe(false);
  });

  // Null actual value with non-null operators returns false
  it('null actual value with comparison operators returns false', () => {
    expect(evaluateCondition(null, 'gt', 5)).toBe(false);
    expect(evaluateCondition(null, 'eq', 'active')).toBe(false);
    expect(evaluateCondition(null, 'contains', 'x')).toBe(false);
  });

  // Numeric string coercion
  it('coerces numeric strings', () => {
    expect(evaluateCondition('100', 'gt', 50)).toBe(true);
    expect(evaluateCondition(100, 'gt', '50')).toBe(true);
  });

  // Unknown operator
  it('unknown operator returns false', () => {
    expect(evaluateCondition(42, 'xor' as any, 42)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// evaluateConditionGroup — AND logic
// ═══════════════════════════════════════════════════════════════════

describe('evaluateConditionGroup', () => {
  it('passes when all conditions pass', () => {
    const values = new Map([
      ['total_visits', 50],
      ['total_spend_cents', 10000],
    ]);
    const group = [
      { metric: 'total_visits' as const, operator: 'gt' as const, value: 10 },
      { metric: 'total_spend_cents' as const, operator: 'gt' as const, value: 5000 },
    ];
    const result = evaluateConditionGroup(group, values);
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(2);
    expect(result.details[0]!.passed).toBe(true);
    expect(result.details[1]!.passed).toBe(true);
  });

  it('fails when any condition fails (AND logic)', () => {
    const values = new Map([
      ['total_visits', 50],
      ['total_spend_cents', 1000], // below threshold
    ]);
    const group = [
      { metric: 'total_visits' as const, operator: 'gt' as const, value: 10 },
      { metric: 'total_spend_cents' as const, operator: 'gt' as const, value: 5000 },
    ];
    const result = evaluateConditionGroup(group, values);
    expect(result.passed).toBe(false);
    expect(result.details[1]!.passed).toBe(false);
    expect(result.details[1]!.actualValue).toBe(1000);
  });

  it('returns actualValue as null for missing metrics', () => {
    const values = new Map<string, unknown>();
    const group = [{ metric: 'total_visits' as const, operator: 'gt' as const, value: 10 }];
    const result = evaluateConditionGroup(group, values);
    expect(result.passed).toBe(false);
    expect(result.details[0]!.actualValue).toBeNull();
  });

  it('handles empty conditions array', () => {
    const result = evaluateConditionGroup([], new Map());
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// evaluateAllGroups — OR logic across groups
// ═══════════════════════════════════════════════════════════════════

describe('evaluateAllGroups', () => {
  it('passes when first group passes (short-circuit)', () => {
    const values = new Map([['total_visits', 100]]);
    const groups: SmartTagConditionGroup[] = [
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 10 }] },
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 200 }] },
    ];
    const result = evaluateAllGroups(groups, values);
    expect(result.passed).toBe(true);
    // Evidence from the passing group only
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.passed).toBe(true);
  });

  it('passes when second group passes (first fails)', () => {
    const values = new Map([['total_visits', 100]]);
    const groups: SmartTagConditionGroup[] = [
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 200 }] }, // fails
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 10 }] },  // passes
    ];
    const result = evaluateAllGroups(groups, values);
    expect(result.passed).toBe(true);
  });

  it('fails when no groups pass — returns last group evidence', () => {
    const values = new Map([['total_visits', 5]]);
    const groups: SmartTagConditionGroup[] = [
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 100 }] },
      { conditions: [{ metric: 'total_visits', operator: 'gt', value: 50 }] },
    ];
    const result = evaluateAllGroups(groups, values);
    expect(result.passed).toBe(false);
    expect(result.evidence[0]!.threshold).toBe(50); // last group's threshold
  });

  it('handles empty groups array', () => {
    const result = evaluateAllGroups([], new Map());
    expect(result.passed).toBe(false);
    expect(result.evidence).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractNeededMetrics
// ═══════════════════════════════════════════════════════════════════

describe('extractNeededMetrics', () => {
  it('extracts unique metrics from condition groups', () => {
    const groups: SmartTagConditionGroup[] = [
      {
        conditions: [
          { metric: 'total_visits', operator: 'gt', value: 10 },
          { metric: 'total_spend_cents', operator: 'gt', value: 5000 },
        ],
      },
      {
        conditions: [
          { metric: 'total_visits', operator: 'gt', value: 20 }, // duplicate
          { metric: 'churn_risk', operator: 'gt', value: 0.5 },
        ],
      },
    ];
    const metrics = extractNeededMetrics(groups);
    expect(metrics.size).toBe(3);
    expect(metrics.has('total_visits')).toBe(true);
    expect(metrics.has('total_spend_cents')).toBe(true);
    expect(metrics.has('churn_risk')).toBe(true);
  });

  it('returns empty set for empty groups', () => {
    expect(extractNeededMetrics([]).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// buildEvidence
// ═══════════════════════════════════════════════════════════════════

describe('buildEvidence', () => {
  it('creates evidence object with current timestamp', () => {
    const details = [
      { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 50, passed: true },
    ];
    const evidence = buildEvidence('rule-1', 'VIP Rule', details);
    expect(evidence.ruleId).toBe('rule-1');
    expect(evidence.ruleName).toBe('VIP Rule');
    expect(evidence.conditions).toEqual(details);
    expect(new Date(evidence.evaluatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ═══════════════════════════════════════════════════════════════════
// evaluateCustomerForRule
// ═══════════════════════════════════════════════════════════════════

describe('evaluateCustomerForRule', () => {
  const rule = {
    id: 'rule-1',
    name: 'Test Rule',
    tagId: 'tag-1',
    conditions: [
      { conditions: [{ metric: 'total_visits' as const, operator: 'gt' as const, value: 10 }] },
    ],
    autoRemove: true,
  };

  it('returns apply when conditions pass and customer has no tag', async () => {
    const tx = makeTx();
    mockSelect
      // customer data
      .mockReturnValueOnce(makeSelectChain([{ totalVisits: 50, totalSpend: 10000, lastVisitAt: null, createdAt: '2024-01-01', status: 'active', type: 'person', email: 'x@x.com', phone: null, marketingConsent: true, taxExempt: false, dateOfBirth: null, loyaltyPointsBalance: 0, walletBalanceCents: 0 }]))
      // existing tag check — no tag
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await evaluateCustomerForRule(tx, 'tenant-1', 'cust-1', rule);
    expect(result.action).toBe('apply');
    expect(result.evidence.ruleId).toBe('rule-1');
  });

  it('returns none when conditions pass and customer already has tag', async () => {
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ totalVisits: 50, totalSpend: 10000, lastVisitAt: null, createdAt: '2024-01-01', status: 'active', type: 'person', email: 'x@x.com', phone: null, marketingConsent: true, taxExempt: false, dateOfBirth: null, loyaltyPointsBalance: 0, walletBalanceCents: 0 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'existing-ct' }]));

    const result = await evaluateCustomerForRule(tx, 'tenant-1', 'cust-1', rule);
    expect(result.action).toBe('none');
  });

  it('returns remove when conditions fail, customer has tag, and autoRemove is true', async () => {
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ totalVisits: 2, totalSpend: 100, lastVisitAt: null, createdAt: '2024-01-01', status: 'active', type: 'person', email: null, phone: null, marketingConsent: false, taxExempt: false, dateOfBirth: null, loyaltyPointsBalance: 0, walletBalanceCents: 0 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'existing-ct' }]));

    const result = await evaluateCustomerForRule(tx, 'tenant-1', 'cust-1', rule);
    expect(result.action).toBe('remove');
  });

  it('returns none when conditions fail and autoRemove is false', async () => {
    const noAutoRemoveRule = { ...rule, autoRemove: false };
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ totalVisits: 2, totalSpend: 100, lastVisitAt: null, createdAt: '2024-01-01', status: 'active', type: 'person', email: null, phone: null, marketingConsent: false, taxExempt: false, dateOfBirth: null, loyaltyPointsBalance: 0, walletBalanceCents: 0 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'existing-ct' }]));

    const result = await evaluateCustomerForRule(tx, 'tenant-1', 'cust-1', noAutoRemoveRule);
    expect(result.action).toBe('none');
  });

  it('returns none when conditions fail and customer has no tag', async () => {
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ totalVisits: 2, totalSpend: 100, lastVisitAt: null, createdAt: '2024-01-01', status: 'active', type: 'person', email: null, phone: null, marketingConsent: false, taxExempt: false, dateOfBirth: null, loyaltyPointsBalance: 0, walletBalanceCents: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await evaluateCustomerForRule(tx, 'tenant-1', 'cust-1', rule);
    expect(result.action).toBe('none');
  });
});
