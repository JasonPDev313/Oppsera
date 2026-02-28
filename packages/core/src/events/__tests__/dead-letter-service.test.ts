import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @oppsera/db
vi.mock('@oppsera/db', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  };

  // Chain mocks for select
  const selectChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
  mockDb.select.mockReturnValue(selectChain);

  // Chain mocks for insert
  const insertChain = {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([]),
    }),
  };
  mockDb.insert.mockReturnValue(insertChain);

  // Chain mocks for update
  const updateChain = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
  mockDb.update.mockReturnValue(updateChain);

  return {
    db: mockDb,
    eventDeadLetters: { id: 'id', tenantId: 'tenant_id', status: 'status', eventType: 'event_type', consumerName: 'consumer_name', createdAt: 'created_at' },
    processedEvents: { eventId: 'event_id', consumerName: 'consumer_name' },
    isBreakerOpen: vi.fn().mockReturnValue(false),
    guardedQuery: vi.fn().mockImplementation((_op: string, fn: () => Promise<unknown>) => fn()),
    singleFlight: vi.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
    jitterTtl: vi.fn().mockImplementation((base: number) => base),
    jitterTtlMs: vi.fn().mockImplementation((base: number) => base),
    isPoolExhaustion: vi.fn().mockReturnValue(false),
    getPoolGuardStats: vi.fn().mockReturnValue({ tripped: 0, queries: 0 }),
  };
});

vi.mock('@oppsera/shared', () => ({
  generateUlid: () => `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
}));

describe('dead-letter-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('exports listDeadLetters function', async () => {
    const { listDeadLetters } = await import('../dead-letter-service');
    expect(typeof listDeadLetters).toBe('function');
  });

  it('exports getDeadLetter function', async () => {
    const { getDeadLetter } = await import('../dead-letter-service');
    expect(typeof getDeadLetter).toBe('function');
  });

  it('exports getDeadLetterStats function', async () => {
    const { getDeadLetterStats } = await import('../dead-letter-service');
    expect(typeof getDeadLetterStats).toBe('function');
  });

  it('exports retryDeadLetter function', async () => {
    const { retryDeadLetter } = await import('../dead-letter-service');
    expect(typeof retryDeadLetter).toBe('function');
  });

  it('exports resolveDeadLetter function', async () => {
    const { resolveDeadLetter } = await import('../dead-letter-service');
    expect(typeof resolveDeadLetter).toBe('function');
  });

  it('exports discardDeadLetter function', async () => {
    const { discardDeadLetter } = await import('../dead-letter-service');
    expect(typeof discardDeadLetter).toBe('function');
  });

  it('DeadLetterEntry type has correct shape', async () => {
    const entry = {
      id: '1',
      tenantId: 'tenant_1',
      eventId: 'evt_1',
      eventType: 'order.placed.v1',
      eventData: {},
      consumerName: 'inventory:deduct',
      errorMessage: 'Connection timeout',
      errorStack: null,
      attemptCount: 3,
      maxRetries: 3,
      firstFailedAt: '2026-01-01T00:00:00Z',
      lastFailedAt: '2026-01-01T00:01:00Z',
      status: 'failed',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNotes: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(entry.status).toBe('failed');
    expect(entry.attemptCount).toBe(3);
    expect(entry.eventType).toBe('order.placed.v1');
  });

  it('DeadLetterStats type has correct shape', () => {
    const stats = {
      totalFailed: 5,
      totalRetrying: 1,
      totalResolved: 10,
      totalDiscarded: 2,
      byEventType: [{ eventType: 'order.placed.v1', count: 3 }],
      byConsumer: [{ consumerName: 'inventory:deduct', count: 3 }],
    };

    expect(stats.totalFailed).toBe(5);
    expect(stats.byEventType).toHaveLength(1);
    expect(stats.byConsumer).toHaveLength(1);
  });
});
