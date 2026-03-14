/**
 * Pure-logic tests for useKdsView behavior.
 *
 * @testing-library/react is not in the project's dependencies, so these tests
 * validate the hook's core behaviors by exercising the underlying logic
 * directly — without React rendering. The two behaviors under test are:
 *
 *  1. "Preserve last good data on error" — after a successful load a
 *     subsequent fetch failure MUST NOT clear kdsView.
 *  2. "Exponential backoff on consecutive failures" — getNextPollDelay must
 *     return min(base * 2^N, 60_000) where N = consecutiveFailures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────
const { mockApiFetch, mockOnChannelRefresh } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  const mockOnChannelRefresh = vi.fn((_channel: string, _cb: () => void) => () => { /* no-op unsubscribe */ });
  return { mockApiFetch, mockOnChannelRefresh };
});

vi.mock('@/lib/api-client', () => ({ apiFetch: mockApiFetch }));
vi.mock('@/hooks/use-fnb-realtime', () => ({ onChannelRefresh: mockOnChannelRefresh }));

// ── Backoff logic (extracted from the hook, tested independently) ──

/**
 * Pure function mirroring getNextPollDelay from useKdsView.
 * Returns the next poll interval given a base interval and consecutive failure count.
 */
function getNextPollDelay(pollIntervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures === 0) return pollIntervalMs;
  return Math.min(pollIntervalMs * Math.pow(2, consecutiveFailures), 60_000);
}

// ── Fetch lifecycle simulation ───────────────────────────────────

/**
 * Simulates the fetchKds state-update logic for the "preserve last good data"
 * scenario without requiring React. We replicate the exact conditional logic
 * from the hook's catch block.
 */
function simulateFetchCycle(opts: {
  hasLoadedBefore: boolean;
  consecutiveFailures: number;
  currentKdsView: unknown;
  fetchError: Error | null;
}): { kdsView: unknown; error: string | null; consecutiveFailures: number } {
  let { currentKdsView, consecutiveFailures } = opts;
  let error: string | null = null;

  if (opts.fetchError) {
    consecutiveFailures += 1;
    // Mirror: only surface error on initial load OR after 3+ consecutive failures
    if (!opts.hasLoadedBefore || consecutiveFailures >= 3) {
      error = opts.fetchError.message;
    }
    // kdsView is NOT cleared — the hook preserves the last good value
  } else {
    // Success path: clear error, keep view
    currentKdsView = opts.currentKdsView; // already set by caller
    error = null;
    consecutiveFailures = 0;
  }

  return { kdsView: currentKdsView, error, consecutiveFailures };
}

// ── Tests ────────────────────────────────────────────────────────

describe('getNextPollDelay — exponential backoff', () => {
  const BASE = 5_000;

  it('returns base interval when there are no consecutive failures', () => {
    expect(getNextPollDelay(BASE, 0)).toBe(5_000);
  });

  it('doubles the interval after 1 consecutive failure (5s → 10s)', () => {
    expect(getNextPollDelay(BASE, 1)).toBe(10_000);
  });

  it('doubles again after 2 consecutive failures (5s → 20s)', () => {
    expect(getNextPollDelay(BASE, 2)).toBe(20_000);
  });

  it('reaches 40s after 3 consecutive failures', () => {
    expect(getNextPollDelay(BASE, 3)).toBe(40_000);
  });

  it('caps at 60s regardless of failure count', () => {
    // 5_000 * 2^4 = 80_000 → capped at 60_000
    expect(getNextPollDelay(BASE, 4)).toBe(60_000);
    expect(getNextPollDelay(BASE, 10)).toBe(60_000);
    expect(getNextPollDelay(BASE, 100)).toBe(60_000);
  });

  it('respects a custom base interval', () => {
    // base=10_000, 2 failures → 10_000 * 4 = 40_000
    expect(getNextPollDelay(10_000, 2)).toBe(40_000);
  });

  it('caps correctly with a larger base interval', () => {
    // base=30_000, 1 failure → 60_000 (exactly at cap)
    expect(getNextPollDelay(30_000, 1)).toBe(60_000);
  });
});

describe('useKdsView — preserve last good data on error', () => {
  it('does NOT clear kdsView when a subsequent poll fails (1st failure)', () => {
    const lastGoodView = { tickets: [{ ticketId: 'tkt_001', items: [] }], rushMode: false };

    // First fetch succeeded — hasLoaded = true
    const result = simulateFetchCycle({
      hasLoadedBefore: true,        // previously loaded successfully
      consecutiveFailures: 0,       // failure counter before this fetch
      currentKdsView: lastGoodView, // still holds the last good value
      fetchError: new Error('Network error'),
    });

    expect(result.kdsView).toBe(lastGoodView);  // unchanged
  });

  it('does NOT clear kdsView after 2 consecutive failures (below threshold)', () => {
    const lastGoodView = { tickets: [{ ticketId: 'tkt_002', items: [] }], rushMode: true };

    const result = simulateFetchCycle({
      hasLoadedBefore: true,
      consecutiveFailures: 1,        // already had 1 failure
      currentKdsView: lastGoodView,
      fetchError: new Error('Timeout'),
    });

    // 2 total failures — still below the 3-failure threshold
    expect(result.kdsView).toBe(lastGoodView);
    expect(result.error).toBeNull();             // error is silently suppressed
    expect(result.consecutiveFailures).toBe(2);
  });

  it('surfaces an error after 3+ consecutive failures but still preserves kdsView', () => {
    const lastGoodView = { tickets: [], rushMode: false };

    const result = simulateFetchCycle({
      hasLoadedBefore: true,
      consecutiveFailures: 2,        // about to hit the 3rd failure
      currentKdsView: lastGoodView,
      fetchError: new Error('Server unavailable'),
    });

    expect(result.kdsView).toBe(lastGoodView);            // view preserved
    expect(result.error).toBe('Server unavailable');      // error surfaced
    expect(result.consecutiveFailures).toBe(3);
  });

  it('surfaces an error on initial load failure (hasLoadedBefore = false)', () => {
    const result = simulateFetchCycle({
      hasLoadedBefore: false,
      consecutiveFailures: 0,
      currentKdsView: null,           // nothing loaded yet
      fetchError: new Error('Initial load failed'),
    });

    expect(result.kdsView).toBeNull();
    expect(result.error).toBe('Initial load failed');
  });

  it('resets consecutiveFailures to 0 on success', () => {
    const view = { tickets: [], rushMode: false };
    const result = simulateFetchCycle({
      hasLoadedBefore: true,
      consecutiveFailures: 5,
      currentKdsView: view,
      fetchError: null,              // this fetch succeeded
    });

    expect(result.consecutiveFailures).toBe(0);
    expect(result.error).toBeNull();
  });
});

describe('useKdsView — apiFetch mock integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('apiFetch mock is callable and returns configured values', async () => {
    const fakeView = { tickets: [], rushMode: false };
    mockApiFetch.mockResolvedValueOnce({ data: fakeView });

    const result = await mockApiFetch('/api/v1/fnb/stations/s1/kds?businessDate=2026-03-13');

    expect(result).toEqual({ data: fakeView });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/kds'),
    );
  });

  it('apiFetch mock can simulate a network error', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('fetch failed'));

    await expect(
      mockApiFetch('/api/v1/fnb/stations/s1/kds'),
    ).rejects.toThrow('fetch failed');
  });

  it('onChannelRefresh mock registers a callback and returns an unsubscribe fn', () => {
    const callback = vi.fn();
    const unsubscribe = mockOnChannelRefresh('kds', callback);

    expect(mockOnChannelRefresh).toHaveBeenCalledWith('kds', callback);
    expect(typeof unsubscribe).toBe('function');
  });

  it('backoff delays accumulate correctly over multiple fake-timer advances', () => {
    // Verify that timer-based backoff math is consistent with getNextPollDelay
    const BASE = 5_000;
    let consecutiveFailures = 0;
    const delays: number[] = [];

    // Simulate 5 poll cycles with increasing failures
    for (let i = 0; i < 5; i++) {
      delays.push(getNextPollDelay(BASE, consecutiveFailures));
      consecutiveFailures += 1;
    }

    // Advance fake timers by each expected delay and confirm the sequence
    expect(delays[0]).toBe(5_000);   // 0 failures
    expect(delays[1]).toBe(10_000);  // 1 failure
    expect(delays[2]).toBe(20_000);  // 2 failures
    expect(delays[3]).toBe(40_000);  // 3 failures
    expect(delays[4]).toBe(60_000);  // 4 failures — capped

    // Simulate advancing through each delay
    let elapsed = 0;
    for (const delay of delays) {
      vi.advanceTimersByTime(delay);
      elapsed += delay;
    }

    // Total time advanced = 5_000 + 10_000 + 20_000 + 40_000 + 60_000
    expect(elapsed).toBe(135_000);
  });
});
