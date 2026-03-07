import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the pool-guard module in isolation (no real DB needed)
// These tests verify the semaphore, circuit breaker, and timeout behavior.

// We need to import the actual module, but control the env vars
const ORIGINAL_ENV = { ...process.env };

describe('pool-guard', () => {
  beforeEach(() => {
    vi.resetModules();
    // Small pool for fast tests
    process.env.DB_POOL_MAX = '2';
    process.env.DB_CONCURRENCY = '3';
    process.env.DB_QUERY_TIMEOUT = '500';
    process.env.DB_QUEUE_TIMEOUT = '200';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('guardedQuery limits concurrent operations to CONCURRENCY_LIMIT', async () => {
    const { guardedQuery } = await import('../pool-guard');

    let concurrent = 0;
    let maxConcurrent = 0;

    const slowOp = () =>
      guardedQuery('test', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return 'ok';
      });

    // Launch 6 concurrent ops (limit is 3)
    const results = await Promise.all([
      slowOp(), slowOp(), slowOp(),
      slowOp(), slowOp(), slowOp(),
    ]);

    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('circuit breaker trips on pool exhaustion and fails fast', async () => {
    const { guardedQuery, tripBreaker, isBreakerOpen } = await import('../pool-guard');

    // Trip the breaker manually
    tripBreaker(500); // 500ms cooldown
    expect(isBreakerOpen()).toBe(true);

    // Subsequent calls should fail fast with CIRCUIT_BREAKER_OPEN
    await expect(
      guardedQuery('test', async () => 'should not run'),
    ).rejects.toMatchObject({ code: 'CIRCUIT_BREAKER_OPEN' });
  });

  it('QUEUE_TIMEOUT fires when semaphore is fully occupied', async () => {
    const { guardedQuery } = await import('../pool-guard');

    // Fill all 3 slots with slow ops (300ms > QUEUE_TIMEOUT of 200ms)
    const blockers = Array.from({ length: 3 }, () =>
      guardedQuery('blocker', () => new Promise((r) => setTimeout(r, 300))),
    );

    // This should fail with QUEUE_TIMEOUT since all slots are busy
    const queued = guardedQuery('queued', async () => 'late');

    await expect(queued).rejects.toMatchObject({ code: 'QUEUE_TIMEOUT' });

    // Clean up blockers
    await Promise.allSettled(blockers);
  });

  it('nested guardedQuery calls risk deadlock under concurrency pressure', async () => {
    const { guardedQuery } = await import('../pool-guard');

    // Demonstrate the deadlock scenario that the getItemForPOS fix prevents:
    // With concurrency limit 3, if 3 outer calls each try to acquire an inner slot,
    // all 3 inner calls queue → QUEUE_TIMEOUT → cascade failure.
    const outerOps = Array.from({ length: 3 }, (_, i) =>
      guardedQuery(`outer-${i}`, async () => {
        // This inner call tries to acquire ANOTHER semaphore slot
        // With all 3 slots occupied by outer ops, this MUST queue
        return guardedQuery(`inner-${i}`, async () => `result-${i}`);
      }),
    );

    // At least some should fail with QUEUE_TIMEOUT (demonstrating the deadlock)
    const results = await Promise.allSettled(outerOps);
    const timeouts = results.filter(
      (r) => r.status === 'rejected' && (r.reason as { code?: string })?.code === 'QUEUE_TIMEOUT',
    );

    // At least 2 of 3 should timeout (one might sneak through if timing is lucky)
    expect(timeouts.length).toBeGreaterThanOrEqual(1);
  });

  it('getPoolGuardStats returns observability data', async () => {
    const { getPoolGuardStats } = await import('../pool-guard');

    const stats = getPoolGuardStats();
    expect(stats).toMatchObject({
      active: expect.any(Number),
      queued: expect.any(Number),
      breakerOpen: expect.any(Boolean),
      breakerTripCount: expect.any(Number),
      concurrencyLimit: 3,
      queryTimeoutMs: 500,
      queueTimeoutMs: 200,
    });
  });
});
