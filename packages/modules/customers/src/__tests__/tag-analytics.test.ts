import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockWithTenant,
  mockExecute,
} = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([]);
  const mockWithTenant = vi.fn();
  return { mockWithTenant, mockExecute };
});

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  tags: { id: 'id', tenantId: 'tenant_id', name: 'name', customerCount: 'customer_count' },
  customerTags: { id: 'id', tenantId: 'tenant_id', tagId: 'tag_id', customerId: 'customer_id', appliedAt: 'applied_at', removedAt: 'removed_at' },
  smartTagRules: { id: 'id', tenantId: 'tenant_id', tagId: 'tag_id', isActive: 'is_active', lastEvaluatedAt: 'last_evaluated_at' },
  smartTagEvaluations: { id: 'id', ruleId: 'rule_id', status: 'status' },
  tagActions: { id: 'id', tenantId: 'tenant_id', tagId: 'tag_id', isActive: 'is_active' },
  tagActionExecutions: { id: 'id', actionId: 'action_id', status: 'status' },
  customerMetricsLifetime: { tenantId: 'tenant_id', customerId: 'customer_id', totalSpendCents: 'total_spend_cents', totalVisits: 'total_visits' },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'test-ulid'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: unknown[]) => ({ type: 'eq', args: a })),
  and: vi.fn((...a: unknown[]) => ({ type: 'and', args: a })),
  isNull: vi.fn((a: unknown) => ({ type: 'isNull', arg: a })),
  isNotNull: vi.fn((a: unknown) => ({ type: 'isNotNull', arg: a })),
  sql: Object.assign(vi.fn((...a: unknown[]) => ({ type: 'sql', args: a })), {
    join: vi.fn(() => ({ type: 'sql.join' })),
    raw: vi.fn((s: string) => ({ type: 'sql.raw', value: s })),
  }),
  gte: vi.fn((...a: unknown[]) => ({ type: 'gte', args: a })),
  desc: vi.fn((a: unknown) => ({ type: 'desc', arg: a })),
  asc: vi.fn((a: unknown) => ({ type: 'asc', arg: a })),
  count: vi.fn(() => ({ type: 'count' })),
  sum: vi.fn(() => ({ type: 'sum' })),
  avg: vi.fn(() => ({ type: 'avg' })),
}));

// ── Imports ─────────────────────────────────────────────────────

import {
  getTagPopulationTrends,
  getTagOverlapMatrix,
  getTagEffectiveness,
  getTagHealth,
} from '../queries/tag-analytics';

// ── Helpers ─────────────────────────────────────────────────────

beforeEach(() => {
  mockWithTenant.mockReset();
  mockExecute.mockReset();
  mockExecute.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════
// getTagPopulationTrends
// ═══════════════════════════════════════════════════════════════════

describe('getTagPopulationTrends', () => {
  it('returns population data with daily points', async () => {
    const mockRows = [
      { date: '2026-01-01', tag_id: 'tag-1', tag_name: 'VIP', tag_color: '#ff0000', count: 5 },
      { date: '2026-01-02', tag_id: 'tag-1', tag_name: 'VIP', tag_color: '#ff0000', count: 7 },
      { date: '2026-01-03', tag_id: 'tag-1', tag_name: 'VIP', tag_color: '#ff0000', count: 10 },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagPopulationTrends({ tenantId: 'tenant-1', days: 3 });
    expect(result).toBeDefined();
    expect(result.trends).toBeDefined();
    expect(result.trends.length).toBe(3);
    expect(result.trends[0]!.tagId).toBe('tag-1');
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThanOrEqual(1);
    expect(result.summary[0]!.tagId).toBe('tag-1');
  });

  it('calculates changePercent correctly', async () => {
    const mockRows = [
      { date: '2026-01-01', tag_id: 'tag-1', tag_name: 'VIP', tag_color: '#ff0000', count: 10 },
      { date: '2026-01-30', tag_id: 'tag-1', tag_name: 'VIP', tag_color: '#ff0000', count: 15 },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagPopulationTrends({ tenantId: 'tenant-1', days: 30 });
    expect(result.summary[0]!.changePercent).toBeDefined();
    // 10 → 15 = +50%
    expect(result.summary[0]!.changePercent).toBe(50);
  });

  it('handles empty result gracefully', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(tx);
    });

    const result = await getTagPopulationTrends({ tenantId: 'tenant-1' });
    expect(result.trends).toHaveLength(0);
    expect(result.summary).toHaveLength(0);
  });

  it('accepts optional tagIds filter', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(tx);
    });

    const result = await getTagPopulationTrends({
      tenantId: 'tenant-1',
      tagIds: ['tag-1', 'tag-2'],
      days: 14,
    });
    expect(result.trends).toBeDefined();
    expect(result.summary).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// getTagOverlapMatrix
// ═══════════════════════════════════════════════════════════════════

describe('getTagOverlapMatrix', () => {
  it('returns overlap pairs with counts', async () => {
    const mockRows = [
      {
        tag_id_a: 'tag-1', tag_name_a: 'VIP',
        tag_id_b: 'tag-2', tag_name_b: 'Member',
        overlap_count: 60,
        count_a: 100, count_b: 80,
      },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagOverlapMatrix('tenant-1');
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]!.tagIdA).toBe('tag-1');
    expect(result.overlaps[0]!.tagIdB).toBe('tag-2');
    expect(result.overlaps[0]!.overlapCount).toBe(60);
  });

  it('flags redundancy when overlap > 80%', async () => {
    const mockRows = [
      {
        tag_id_a: 'tag-1', tag_name_a: 'VIP',
        tag_id_b: 'tag-2', tag_name_b: 'Premium',
        overlap_count: 90,
        count_a: 100, count_b: 95,
      },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagOverlapMatrix('tenant-1');
    expect(result.overlaps[0]!.isRedundant).toBe(true);
    // 90/100 = 90% or 90/95 = ~94.7%
    expect(
      result.overlaps[0]!.overlapPercentA > 80 || result.overlaps[0]!.overlapPercentB > 80,
    ).toBe(true);
  });

  it('does not flag redundancy when overlap < 80%', async () => {
    const mockRows = [
      {
        tag_id_a: 'tag-1', tag_name_a: 'VIP',
        tag_id_b: 'tag-2', tag_name_b: 'Golf',
        overlap_count: 30,
        count_a: 100, count_b: 200,
      },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagOverlapMatrix('tenant-1');
    expect(result.overlaps[0]!.isRedundant).toBe(false);
  });

  it('handles no overlapping tags', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(tx);
    });

    const result = await getTagOverlapMatrix('tenant-1');
    expect(result.overlaps).toHaveLength(0);
    expect(result.redundantPairs).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// getTagEffectiveness
// ═══════════════════════════════════════════════════════════════════

describe('getTagEffectiveness', () => {
  it('returns effectiveness comparison between tagged and untagged', async () => {
    const mockRows = [
      {
        tag_id: 'tag-1',
        tag_name: 'VIP',
        tagged_count: 50,
        untagged_count: 200,
        tagged_avg_spend: '5000.00',
        untagged_avg_spend: '2000.00',
        tagged_avg_visits: '12.00',
        untagged_avg_visits: '5.00',
        tagged_retention: '85.0',
        untagged_retention: '60.0',
      },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagEffectiveness({ tenantId: 'tenant-1', tagId: 'tag-1' });
    expect(result.taggedCount).toBe(50);
    expect(result.untaggedCount).toBe(200);
    expect(result.spendLift).toBeDefined();
    expect(result.visitLift).toBeDefined();
    // 5000/2000 - 1 = 150% lift
    expect(result.spendLift).toBe(150);
    // 12/5 - 1 = 140% lift
    expect(result.visitLift).toBe(140);
  });

  it('handles no data (no row returned)', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue([]) };
      return fn(tx);
    });

    const result = await getTagEffectiveness({ tenantId: 'tenant-1', tagId: 'tag-1' });
    expect(result.taggedCount).toBe(0);
    expect(result.untaggedCount).toBe(0);
    expect(result.spendLift).toBe(0);
    expect(result.visitLift).toBe(0);
  });

  it('handles zero untagged spend gracefully (no division by zero)', async () => {
    const mockRows = [
      {
        tag_id: 'tag-1',
        tag_name: 'VIP',
        tagged_count: 50,
        untagged_count: 0,
        tagged_avg_spend: '5000.00',
        untagged_avg_spend: '0.00',
        tagged_avg_visits: '12.00',
        untagged_avg_visits: '0.00',
        tagged_retention: '85.0',
        untagged_retention: '0.0',
      },
    ];
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue(mockRows) };
      return fn(tx);
    });

    const result = await getTagEffectiveness({ tenantId: 'tenant-1', tagId: 'tag-1' });
    expect(result.taggedCount).toBe(50);
    expect(result.untaggedCount).toBe(0);
    // Zero untagged spend → lift should be 0 (no division by zero crash)
    expect(result.spendLift).toBe(0);
    expect(result.visitLift).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// getTagHealth
// ═══════════════════════════════════════════════════════════════════

describe('getTagHealth', () => {
  // getTagHealth makes 8 sequential tx.execute calls:
  // 1. tagStats, 2. ruleStats, 3. staleRules, 4. emptyTags,
  // 5. skipRates, 6. failureRates, 7. noActions, 8. activityRows

  it('returns health score and items', async () => {
    // Mock: no stale rules, no empty tags, no high skip/failure rates = perfect health
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 3, active_rules: 2 }])
          // 3. staleRules
          .mockResolvedValueOnce([])
          // 4. emptyTags
          .mockResolvedValueOnce([])
          // 5. skipRates
          .mockResolvedValueOnce([])
          // 6. failureRates
          .mockResolvedValueOnce([])
          // 7. noActions
          .mockResolvedValueOnce([])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBe(100);
    expect(result.items).toHaveLength(0);
    expect(result.totalTags).toBe(5);
    expect(result.activeTags).toBe(4);
    expect(result.totalRules).toBe(3);
    expect(result.activeRules).toBe(2);
  });

  it('deducts for stale rules', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 3, active_rules: 2 }])
          // 3. staleRules — 2 rules not evaluated in 7+ days
          .mockResolvedValueOnce([
            { id: 'r1', name: 'Stale Rule 1', tag_id: 't1', tag_name: 'VIP', last_evaluated_at: '2025-01-01' },
            { id: 'r2', name: 'Stale Rule 2', tag_id: 't2', tag_name: 'Loyal', last_evaluated_at: '2025-01-01' },
          ])
          // 4. emptyTags
          .mockResolvedValueOnce([])
          // 5. skipRates
          .mockResolvedValueOnce([])
          // 6. failureRates
          .mockResolvedValueOnce([])
          // 7. noActions
          .mockResolvedValueOnce([])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeLessThan(100);
    expect(result.items.some((i) => i.type === 'stale_rule')).toBe(true);
  });

  it('deducts for empty tags', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 2, active_rules: 1 }])
          // 3. staleRules
          .mockResolvedValueOnce([])
          // 4. emptyTags
          .mockResolvedValueOnce([
            { id: 't1', name: 'Empty Tag' },
          ])
          // 5. skipRates
          .mockResolvedValueOnce([])
          // 6. failureRates
          .mockResolvedValueOnce([])
          // 7. noActions
          .mockResolvedValueOnce([])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeLessThan(100);
    expect(result.items.some((i) => i.type === 'empty_tag')).toBe(true);
  });

  it('deducts for high skip rate', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 2, active_rules: 1 }])
          // 3. staleRules
          .mockResolvedValueOnce([])
          // 4. emptyTags
          .mockResolvedValueOnce([])
          // 5. skipRates — high skip rate >50%
          .mockResolvedValueOnce([
            { tag_id: 't1', tag_name: 'VIP', action_type: 'log_activity', skipped: 60, total: 100 },
          ])
          // 6. failureRates
          .mockResolvedValueOnce([])
          // 7. noActions
          .mockResolvedValueOnce([])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeLessThan(100);
    expect(result.items.some((i) => i.type === 'high_skip_rate')).toBe(true);
  });

  it('deducts for high failure rate', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 2, active_rules: 1 }])
          // 3. staleRules
          .mockResolvedValueOnce([])
          // 4. emptyTags
          .mockResolvedValueOnce([])
          // 5. skipRates
          .mockResolvedValueOnce([])
          // 6. failureRates — high failure rate >20%
          .mockResolvedValueOnce([
            { tag_id: 't1', tag_name: 'VIP', action_type: 'set_customer_field', failed: 15, total: 50 },
          ])
          // 7. noActions
          .mockResolvedValueOnce([])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeLessThan(100);
    expect(result.items.some((i) => i.type === 'high_failure_rate')).toBe(true);
  });

  it('deducts for tags with no actions', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 5, active_tags: 4 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 2, active_rules: 1 }])
          // 3. staleRules
          .mockResolvedValueOnce([])
          // 4. emptyTags
          .mockResolvedValueOnce([])
          // 5. skipRates
          .mockResolvedValueOnce([])
          // 6. failureRates
          .mockResolvedValueOnce([])
          // 7. noActions — tags with smart rules but no actions
          .mockResolvedValueOnce([
            { id: 't3', name: 'No Actions Tag' },
          ])
          // 8. activityRows
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeLessThan(100);
    expect(result.items.some((i) => i.type === 'no_actions')).toBe(true);
  });

  it('combines multiple issues and caps score at 0', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. tagStats
          .mockResolvedValueOnce([{ total_tags: 20, active_tags: 10 }])
          // 2. ruleStats
          .mockResolvedValueOnce([{ total_rules: 10, active_rules: 5 }])
          // 3. staleRules — 5 stale
          .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({
            id: `r${i}`, name: `Stale ${i}`, tag_id: `t${i}`, tag_name: `Tag ${i}`, last_evaluated_at: '2025-01-01',
          })))
          // 4. emptyTags — 10 empty
          .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({
            id: `et${i}`, name: `Empty ${i}`,
          })))
          // 5. skipRates — 5 high skip
          .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({
            tag_id: `st${i}`, tag_name: `T${i}`, action_type: 'log_activity', skipped: 80, total: 100,
          })))
          // 6. failureRates — 5 high failure
          .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({
            tag_id: `ft${i}`, tag_name: `F${i}`, action_type: 'set_customer_field', failed: 25, total: 50,
          })))
          // 7. noActions — 5 no-action tags
          .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({
            id: `na${i}`, name: `NoAction ${i}`,
          })))
          // 8. activityRows
          .mockResolvedValueOnce([
            { action: 'applied', count: 50 },
            { action: 'removed', count: 10 },
          ]),
      };
      return fn(tx);
    });

    const result = await getTagHealth('tenant-1');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.items.length).toBeGreaterThan(5);
    expect(result.recentActivity).toBeDefined();
  });
});
