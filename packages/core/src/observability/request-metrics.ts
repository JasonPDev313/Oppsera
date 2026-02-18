/**
 * Per-request metrics tracking via AsyncLocalStorage.
 *
 * Tracks DB query count/timing and other per-request observability data.
 * Layered on top of the existing RequestContext (auth/context.ts).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestMetrics {
  startTime: number;
  dbQueryCount: number;
  dbQueryTimeMs: number;
  coldStart: boolean;
}

export const metricsStore = new AsyncLocalStorage<RequestMetrics>();

// Cold start detection — module-level variable set once per function instance
let _isFirstInvocation = true;

export function createRequestMetrics(): RequestMetrics {
  const isCold = _isFirstInvocation;
  _isFirstInvocation = false;
  return {
    startTime: Date.now(),
    dbQueryCount: 0,
    dbQueryTimeMs: 0,
    coldStart: isCold,
  };
}

export function getRequestMetrics(): RequestMetrics | undefined {
  return metricsStore.getStore();
}

export function recordDbQuery(durationMs: number): void {
  const metrics = metricsStore.getStore();
  if (metrics) {
    metrics.dbQueryCount++;
    metrics.dbQueryTimeMs += durationMs;
  }
}
