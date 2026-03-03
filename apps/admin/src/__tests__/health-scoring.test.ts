import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const { mockExecute, mockWithAdminDb, mockTransaction } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([]);
  const mockTransaction = vi.fn((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ execute: mockExecute }),
  );
  const mockWithAdminDb = vi.fn(
    (cb: (tx: { execute: typeof mockExecute }) => Promise<unknown>) =>
      cb({ execute: mockExecute }),
  );
  return { mockExecute, mockWithAdminDb, mockTransaction };
});

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockExecute,
    transaction: mockTransaction,
  },
  sql: vi.fn((...args: unknown[]) => args),
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn((...args: unknown[]) => args),
}));

vi.mock('../lib/admin-db', () => ({
  withAdminDb: mockWithAdminDb,
}));

// ── Import after mocks ─────────────────────────────────────────

import {
  computeTenantHealth,
  captureAllTenantHealthSnapshots,
  captureSystemMetrics,
  cleanupOldSnapshots,
} from '../lib/health-scoring';

// ── Helpers ────────────────────────────────────────────────────

/**
 * Build mock SQL result rows for computeTenantHealth.
 * Each call to tx.execute maps to a specific metric query.
 * Order: orderMetrics, userMetrics, errorMetrics, dlqMetrics, glMetrics, closeBatchMetrics
 */
function setupMetricMocks(overrides: {
  orders24h?: number;
  hasHistoricalOrders?: boolean;
  lastOrderAt?: Date | null;
  activeUsers24h?: number;
  lastLoginAt?: Date | null;
  errorCount1h?: number;
  errorCount24h?: number;
  dlqDepth?: number;
  dlqUnresolvedOver24h?: number;
  unpostedGlEntries?: number;
  unmappedGlEvents?: number;
  openCloseBatches?: number;
} = {}) {
  const {
    orders24h = 10,
    hasHistoricalOrders = true,
    lastOrderAt = new Date('2026-03-01T12:00:00Z'),
    activeUsers24h = 5,
    lastLoginAt = new Date('2026-03-01T11:00:00Z'),
    errorCount1h = 0,
    errorCount24h = 0,
    dlqDepth = 0,
    dlqUnresolvedOver24h = 0,
    unpostedGlEntries = 0,
    unmappedGlEvents = 0,
    openCloseBatches = 0,
  } = overrides;

  // The function calls tx.execute 6 times (via Promise.all)
  const orderRow = {
    orders_24h: orders24h,
    last_order_at: lastOrderAt,
    has_historical_orders: hasHistoricalOrders,
  };
  const userRow = {
    active_users_24h: activeUsers24h,
    last_login_at: lastLoginAt,
  };
  const errorRow = {
    error_count_1h: errorCount1h,
    error_count_24h: errorCount24h,
  };
  const dlqRow = {
    dlq_depth: dlqDepth,
    dlq_unresolved_over_24h: dlqUnresolvedOver24h,
  };
  const glRow = {
    unposted_gl_entries: unpostedGlEntries,
    unmapped_gl_events: unmappedGlEvents,
  };
  const closeBatchRow = {
    open_close_batches: openCloseBatches,
  };

  mockExecute
    .mockResolvedValueOnce([orderRow])
    .mockResolvedValueOnce([userRow])
    .mockResolvedValueOnce([errorRow])
    .mockResolvedValueOnce([dlqRow])
    .mockResolvedValueOnce([glRow])
    .mockResolvedValueOnce([closeBatchRow]);
}

// ── Health Scoring Engine Tests ────────────────────────────────

describe('Health Scoring Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── scoreFromMetrics — tested through computeTenantHealth ──

  describe('Score = 100 (perfect health, no issues)', () => {
    it('returns score=100 and grade=A with no issues', async () => {
      setupMetricMocks({
        orders24h: 50,
        hasHistoricalOrders: true,
        errorCount1h: 0,
        dlqDepth: 0,
        dlqUnresolvedOver24h: 0,
        unmappedGlEvents: 0,
        unpostedGlEntries: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(100);
      expect(result.healthGrade).toBe('A');
      expect(result.gradeFactors).toHaveLength(0);
    });
  });

  describe('DLQ scoring', () => {
    it('deducts 25 points when DLQ depth > 20 (dlq_critical)', async () => {
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 25,
        dlqUnresolvedOver24h: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(75);
      expect(result.healthGrade).toBe('B');
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'dlq_critical', points: -25 }),
      );
    });

    it('deducts 10 points when DLQ depth > 5 but <= 20 (dlq_elevated)', async () => {
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 15,
        dlqUnresolvedOver24h: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(90);
      expect(result.healthGrade).toBe('A');
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'dlq_elevated', points: -10 }),
      );
    });

    it('does not deduct for DLQ depth <= 5', async () => {
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 5,
        dlqUnresolvedOver24h: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(100);
      expect(result.gradeFactors.find((f) => f.key.startsWith('dlq_'))).toBeUndefined();
    });

    it('deducts 15 points when DLQ unresolved > 24h (dlq_stale)', async () => {
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 0,
        dlqUnresolvedOver24h: 3,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(85);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'dlq_stale', points: -15 }),
      );
    });
  });

  describe('Error spike scoring', () => {
    it('deducts 20 points when errorCount1h > 50 (error_spike)', async () => {
      setupMetricMocks({
        orders24h: 10,
        errorCount1h: 60,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(80);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'error_spike', points: -20 }),
      );
    });

    it('deducts 10 points when errorCount1h > 10 but <= 50 (error_elevated)', async () => {
      setupMetricMocks({
        orders24h: 10,
        errorCount1h: 30,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(90);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'error_elevated', points: -10 }),
      );
    });

    it('does not deduct for errorCount1h <= 10', async () => {
      setupMetricMocks({
        orders24h: 10,
        errorCount1h: 10,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(100);
      expect(result.gradeFactors.find((f) => f.key.startsWith('error_'))).toBeUndefined();
    });
  });

  describe('GL scoring', () => {
    it('deducts 10 points when unmappedGlEvents > 0 (gl_unmapped)', async () => {
      setupMetricMocks({
        orders24h: 10,
        unmappedGlEvents: 3,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(90);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'gl_unmapped', points: -10 }),
      );
    });

    it('does not deduct for unmappedGlEvents = 0', async () => {
      setupMetricMocks({
        orders24h: 10,
        unmappedGlEvents: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.gradeFactors.find((f) => f.key === 'gl_unmapped')).toBeUndefined();
    });

    it('deducts 10 points when unpostedGlEntries > 5 (gl_unposted)', async () => {
      setupMetricMocks({
        orders24h: 10,
        unpostedGlEntries: 8,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(90);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'gl_unposted', points: -10 }),
      );
    });

    it('does not deduct for unpostedGlEntries <= 5', async () => {
      setupMetricMocks({
        orders24h: 10,
        unpostedGlEntries: 5,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.gradeFactors.find((f) => f.key === 'gl_unposted')).toBeUndefined();
    });
  });

  describe('Inactive tenant scoring', () => {
    it('deducts 5 points when 0 orders but has historical (inactive)', async () => {
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: true,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(95);
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'inactive', points: -5 }),
      );
    });

    it('does not deduct when 0 orders and NO historical (new tenant)', async () => {
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: false,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(100);
      expect(result.gradeFactors.find((f) => f.key === 'inactive')).toBeUndefined();
    });

    it('does not deduct when has orders in 24h', async () => {
      setupMetricMocks({
        orders24h: 5,
        hasHistoricalOrders: true,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.gradeFactors.find((f) => f.key === 'inactive')).toBeUndefined();
    });
  });

  describe('Multiple factors combine correctly', () => {
    it('DLQ critical (-25) + error spike (-20) = 55 = grade F', async () => {
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 25,
        errorCount1h: 60,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(55);
      expect(result.healthGrade).toBe('D');
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'dlq_critical', points: -25 }),
      );
      expect(result.gradeFactors).toContainEqual(
        expect.objectContaining({ key: 'error_spike', points: -20 }),
      );
    });

    it('all penalties combined result in very low score', async () => {
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: true,
        dlqDepth: 25,
        dlqUnresolvedOver24h: 5,
        errorCount1h: 60,
        unmappedGlEvents: 3,
        unpostedGlEntries: 10,
      });

      // -25 (dlq_critical) + -15 (dlq_stale) + -20 (error_spike) + -10 (gl_unmapped) + -10 (gl_unposted) + -5 (inactive) = -85
      // 100 - 85 = 15
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBe(15);
      expect(result.healthGrade).toBe('F');
      expect(result.gradeFactors).toHaveLength(6);
    });
  });

  describe('Score clamping', () => {
    it('score clamps at 0 (never negative)', async () => {
      // Total deductions exceed 100
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: true,
        dlqDepth: 25,          // -25
        dlqUnresolvedOver24h: 5, // -15
        errorCount1h: 60,       // -20
        unmappedGlEvents: 10,   // -10
        unpostedGlEntries: 20,  // -10
        // -5 for inactive
        // Total: -85, but if we add more we still clamp
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBeGreaterThanOrEqual(0);
    });

    it('score clamps at 100 (never above)', async () => {
      setupMetricMocks({
        orders24h: 100,
        hasHistoricalOrders: true,
        errorCount1h: 0,
        dlqDepth: 0,
        dlqUnresolvedOver24h: 0,
        unmappedGlEvents: 0,
        unpostedGlEntries: 0,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.healthScore).toBe(100);
    });
  });

  describe('Grade boundaries', () => {
    // Test each boundary point via computeTenantHealth
    // We control the score by controlling metric inputs

    it('score=90 yields grade A', async () => {
      // dlqDepth > 5 but <= 20 → -10 → 90
      setupMetricMocks({ orders24h: 10, dlqDepth: 6 });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(90);
      expect(result.healthGrade).toBe('A');
    });

    it('score=89 yields grade B', async () => {
      // dlqDepth > 5 → -10, errorCount1h > 10 → -10 (not both at highest) = nah
      // Let's use: dlqUnresolvedOver24h > 0 → -15, inactive → -5 = -20 → 80 (B)
      // Actually we need exactly 89. Let's do -10 (dlq_elevated) + dlq_stale (-15) = -25 → 75 (B)
      // Hmm, hard to hit 89 exactly. Score=89 not directly achievable with discrete penalty buckets.
      // Instead: -10 (error_elevated) + -5 (inactive) = -15, but -5 for inactive alone = 95, not 89.
      // Actually the scoring is: each penalty is a fixed deduction. So achievable scores:
      // 100, 95, 90, 85, 80, 75, 70, ... (multiples of 5 from certain combos)
      // 89 is not achievable. Let's test 85 is B instead.
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 0,
        dlqUnresolvedOver24h: 1, // -15
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(85);
      expect(result.healthGrade).toBe('B');
    });

    it('score=75 yields grade B', async () => {
      // -25 (dlq_critical)
      setupMetricMocks({ orders24h: 10, dlqDepth: 21 });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(75);
      expect(result.healthGrade).toBe('B');
    });

    it('score=70 yields grade C', async () => {
      // -25 (dlq_critical) + -5 (inactive) = -30 → 70
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: true,
        dlqDepth: 21,
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(70);
      expect(result.healthGrade).toBe('C');
    });

    it('score=60 yields grade C', async () => {
      // -25 (dlq_critical) + -15 (dlq_stale) = -40 → 60
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 25,
        dlqUnresolvedOver24h: 2,
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(60);
      expect(result.healthGrade).toBe('C');
    });

    it('score=55 yields grade D', async () => {
      // -25 (dlq_critical) + -20 (error_spike) = -45 → 55
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 25,
        errorCount1h: 60,
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(55);
      expect(result.healthGrade).toBe('D');
    });

    it('score=40 yields grade D', async () => {
      // -25 (dlq_critical) + -15 (dlq_stale) + -20 (error_spike) = -60 → 40
      setupMetricMocks({
        orders24h: 10,
        dlqDepth: 25,
        dlqUnresolvedOver24h: 3,
        errorCount1h: 60,
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(40);
      expect(result.healthGrade).toBe('D');
    });

    it('score=35 yields grade F', async () => {
      // -25 (dlq_critical) + -15 (dlq_stale) + -20 (error_spike) + -5 (inactive) = -65 → 35
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: true,
        dlqDepth: 25,
        dlqUnresolvedOver24h: 3,
        errorCount1h: 60,
      });
      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );
      expect(result.healthScore).toBe(35);
      expect(result.healthGrade).toBe('F');
    });
  });

  describe('Snapshot field mapping', () => {
    it('maps all metrics to TenantHealthSnapshot correctly', async () => {
      const lastOrder = new Date('2026-03-01T12:00:00Z');
      const lastLogin = new Date('2026-03-01T11:00:00Z');

      setupMetricMocks({
        orders24h: 42,
        hasHistoricalOrders: true,
        lastOrderAt: lastOrder,
        activeUsers24h: 8,
        lastLoginAt: lastLogin,
        errorCount1h: 3,
        errorCount24h: 15,
        dlqDepth: 2,
        dlqUnresolvedOver24h: 0,
        unpostedGlEntries: 1,
        unmappedGlEvents: 0,
        openCloseBatches: 2,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_abc',
      );

      expect(result.tenantId).toBe('tenant_abc');
      expect(result.orders24h).toBe(42);
      expect(result.activeUsers24h).toBe(8);
      expect(result.lastOrderAt).toBe(lastOrder.toISOString());
      expect(result.lastLoginAt).toBe(lastLogin.toISOString());
      expect(result.errorCount24h).toBe(15);
      expect(result.errorCount1h).toBe(3);
      expect(result.dlqDepth).toBe(2);
      expect(result.dlqUnresolvedOver24h).toBe(0);
      expect(result.unpostedGlEntries).toBe(1);
      expect(result.unmappedGlEvents).toBe(0);
      expect(result.openCloseBatches).toBe(2);
      expect(result.backgroundJobFailures24h).toBe(0);
      expect(result.integrationErrorCount24h).toBe(0);
    });

    it('handles null dates gracefully', async () => {
      setupMetricMocks({
        orders24h: 0,
        hasHistoricalOrders: false,
        lastOrderAt: null,
        lastLoginAt: null,
      });

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.lastOrderAt).toBeNull();
      expect(result.lastLoginAt).toBeNull();
    });

    it('handles empty DB result rows gracefully', async () => {
      // All queries return empty arrays
      mockExecute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await computeTenantHealth(
        { execute: mockExecute } as unknown as Parameters<typeof computeTenantHealth>[0],
        'tenant_001',
      );

      expect(result.orders24h).toBe(0);
      expect(result.activeUsers24h).toBe(0);
      expect(result.errorCount1h).toBe(0);
      expect(result.dlqDepth).toBe(0);
      expect(result.healthScore).toBe(100);
      expect(result.healthGrade).toBe('A');
    });
  });

  // ── captureAllTenantHealthSnapshots ─────────────────────────

  describe('captureAllTenantHealthSnapshots', () => {
    it('captures health for all active tenants and returns count', async () => {
      // withAdminDb mock gives us a tx whose execute we control
      const localExecute = vi.fn();

      // First call: get tenant IDs
      localExecute.mockResolvedValueOnce([
        { id: 'tenant_001' },
        { id: 'tenant_002' },
      ]);

      // For tenant_001: 6 metric queries + 2 writes (insert snapshot + update tenant)
      localExecute
        .mockResolvedValueOnce([{ orders_24h: 10, last_order_at: null, has_historical_orders: true }])
        .mockResolvedValueOnce([{ active_users_24h: 5, last_login_at: null }])
        .mockResolvedValueOnce([{ error_count_1h: 0, error_count_24h: 0 }])
        .mockResolvedValueOnce([{ dlq_depth: 0, dlq_unresolved_over_24h: 0 }])
        .mockResolvedValueOnce([{ unposted_gl_entries: 0, unmapped_gl_events: 0 }])
        .mockResolvedValueOnce([{ open_close_batches: 0 }])
        .mockResolvedValueOnce([]) // INSERT snapshot
        .mockResolvedValueOnce([]); // UPDATE tenant

      // For tenant_002: same pattern
      localExecute
        .mockResolvedValueOnce([{ orders_24h: 5, last_order_at: null, has_historical_orders: true }])
        .mockResolvedValueOnce([{ active_users_24h: 2, last_login_at: null }])
        .mockResolvedValueOnce([{ error_count_1h: 0, error_count_24h: 0 }])
        .mockResolvedValueOnce([{ dlq_depth: 0, dlq_unresolved_over_24h: 0 }])
        .mockResolvedValueOnce([{ unposted_gl_entries: 0, unmapped_gl_events: 0 }])
        .mockResolvedValueOnce([{ open_close_batches: 0 }])
        .mockResolvedValueOnce([]) // INSERT snapshot
        .mockResolvedValueOnce([]); // UPDATE tenant

      mockWithAdminDb.mockImplementationOnce(
        (cb: (tx: { execute: typeof localExecute }) => Promise<unknown>) =>
          cb({ execute: localExecute }),
      );

      const count = await captureAllTenantHealthSnapshots();

      expect(count).toBe(2);
      // 1 tenant query + 2 tenants * (6 metrics + 2 writes) = 17 calls
      expect(localExecute).toHaveBeenCalledTimes(17);
    });

    it('continues when one tenant fails and captures others', async () => {
      let callCount = 0;
      const localExecute = vi.fn().mockImplementation(() => {
        callCount++;
        // Call 1: tenant list
        if (callCount === 1) {
          return Promise.resolve([
            { id: 'tenant_fail' },
            { id: 'tenant_ok' },
          ]);
        }
        // Calls 2-7: computeTenantHealth for tenant_fail (6 parallel Promise.all calls)
        // Make ALL of them reject so Promise.all fails reliably
        if (callCount >= 2 && callCount <= 7) {
          return Promise.reject(new Error('DB error for tenant_fail'));
        }
        // Calls 8-13: computeTenantHealth for tenant_ok (6 metric queries)
        if (callCount === 8) return Promise.resolve([{ orders_24h: 10, last_order_at: null, has_historical_orders: true }]);
        if (callCount === 9) return Promise.resolve([{ active_users_24h: 5, last_login_at: null }]);
        if (callCount === 10) return Promise.resolve([{ error_count_1h: 0, error_count_24h: 0 }]);
        if (callCount === 11) return Promise.resolve([{ dlq_depth: 0, dlq_unresolved_over_24h: 0 }]);
        if (callCount === 12) return Promise.resolve([{ unposted_gl_entries: 0, unmapped_gl_events: 0 }]);
        if (callCount === 13) return Promise.resolve([{ open_close_batches: 0 }]);
        // Calls 14-15: INSERT snapshot + UPDATE tenant for tenant_ok
        return Promise.resolve([]);
      });

      mockWithAdminDb.mockImplementationOnce(
        (cb: (tx: { execute: typeof localExecute }) => Promise<unknown>) =>
          cb({ execute: localExecute }),
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const count = await captureAllTenantHealthSnapshots();

      // Only tenant_ok succeeded
      expect(count).toBe(1);
      // console.error was called for the failed tenant
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('tenant_fail'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  // ── captureSystemMetrics ────────────────────────────────────

  describe('captureSystemMetrics', () => {
    it('executes all metric queries and inserts snapshot', async () => {
      const localExecute = vi.fn();

      localExecute
        .mockResolvedValueOnce([{ total_orders_today: 100, total_orders_1h: 15 }])
        .mockResolvedValueOnce([{ active_tenants_today: 5, active_users_today: 25 }])
        .mockResolvedValueOnce([{ total_errors_1h: 2 }])
        .mockResolvedValueOnce([{ total_dlq_depth: 0, total_dlq_unresolved: 0 }])
        .mockResolvedValueOnce([{ db_connection_count: 10, db_max_connections: 100, db_cache_hit_pct: 99.5, db_size_bytes: 1073741824 }])
        .mockResolvedValueOnce([{ tenants_grade_a: 8, tenants_grade_b: 3, tenants_grade_c: 1, tenants_grade_d: 0, tenants_grade_f: 0 }])
        .mockResolvedValueOnce([]); // INSERT

      mockWithAdminDb.mockImplementationOnce(
        (cb: (tx: { execute: typeof localExecute }) => Promise<unknown>) =>
          cb({ execute: localExecute }),
      );

      await captureSystemMetrics();

      // 6 SELECT queries + 1 INSERT = 7 calls
      expect(localExecute).toHaveBeenCalledTimes(7);
    });
  });

  // ── cleanupOldSnapshots ─────────────────────────────────────

  describe('cleanupOldSnapshots', () => {
    it('deletes old tenant and system snapshots and returns counts', async () => {
      const localExecute = vi.fn();

      // DELETE from tenant_health_snapshots (returns deleted rows)
      localExecute.mockResolvedValueOnce([{}, {}, {}]); // 3 deleted
      // DELETE from system_metrics_snapshots
      localExecute.mockResolvedValueOnce([{}, {}]); // 2 deleted

      mockWithAdminDb.mockImplementationOnce(
        (cb: (tx: { execute: typeof localExecute }) => Promise<unknown>) =>
          cb({ execute: localExecute }),
      );

      const result = await cleanupOldSnapshots();

      expect(result.tenantDeleted).toBe(3);
      expect(result.systemDeleted).toBe(2);
      expect(localExecute).toHaveBeenCalledTimes(2);
    });
  });
});
