/**
 * Module-level cache for prepare-check promises.
 *
 * Allows FnbTabView (handlePay) to kick off the prepare-check POST before
 * navigating, so FnbPaymentView can pick up the in-flight promise on mount
 * instead of waiting for tab data → effect → POST waterfall.
 */

import { apiFetch } from '@/lib/api-client';
import type { CheckSummary } from '@/types/fnb';

interface PrepareCheckResult {
  orderId: string;
  check: CheckSummary;
}

interface CacheEntry {
  promise: Promise<PrepareCheckResult | null>;
  ts: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30s — prepare-check should resolve well within this

/**
 * Start a prepare-check POST for a tab. Returns the promise.
 * If one is already in-flight for this tab, returns the existing promise.
 */
export function startPrepareCheck(tabId: string, locationId: string): Promise<PrepareCheckResult | null> {
  const existing = _cache.get(tabId);
  if (existing && Date.now() - existing.ts < CACHE_TTL_MS) {
    return existing.promise;
  }

  const promise = (async () => {
    try {
      const res = await apiFetch<{ data: PrepareCheckResult }>(
        `/api/v1/fnb/tabs/${tabId}/prepare-check`,
        {
          method: 'POST',
          headers: { 'X-Location-Id': locationId },
        },
      );
      return res.data;
    } catch {
      return null;
    }
  })();

  _cache.set(tabId, { promise, ts: Date.now() });
  return promise;
}

/**
 * Get an existing pre-warm promise if one was started (e.g. from handlePay).
 * Returns null if no pre-warm is in progress.
 */
export function getPreWarmPromise(tabId: string): Promise<PrepareCheckResult | null> | null {
  const entry = _cache.get(tabId);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(tabId);
    return null;
  }
  // Consume-on-read: delete immediately so slow devices don't miss the entry,
  // and re-use on retry is prevented.
  _cache.delete(tabId);
  return entry.promise;
}

/** Clear any cached promise for a tab (e.g. on retry). */
export function clearPrepareCheckCache(tabId: string): void {
  _cache.delete(tabId);
}
