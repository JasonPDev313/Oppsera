/**
 * Error classification — maps error patterns to severity levels for alerting.
 *
 * P0 (Critical — immediate): RLS breach, payment failures, DB down
 * P1 (High — 1 hour): elevated error rate, dead-letter financial jobs, connection pressure
 * P2 (Medium — next business day): new error types, slow queries, cache misses
 * P3 (Low — weekly review): 4xx trends, deprecation warnings
 */

import type { AlertLevel } from './alerts';
import { sendAlert } from './alerts';

interface ErrorClassification {
  level: AlertLevel;
  title: string;
}

// Rolling window counters for rate-based alerts
const errorWindows = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 5 * 60 * 1000; // 5-minute window

function incrementCounter(key: string): number {
  const now = Date.now();
  const entry = errorWindows.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    errorWindows.set(key, { count: 1, windowStart: now });
    return 1;
  }
  entry.count++;
  return entry.count;
}

export function classifyError(error: {
  code?: string;
  message?: string;
  statusCode?: number;
  path?: string;
}): ErrorClassification | null {
  const msg = error.message?.toLowerCase() ?? '';
  const code = error.code?.toLowerCase() ?? '';

  // ── P0: RLS violation ──
  if (msg.includes('tenant_isolation') || msg.includes('row-level security') || code === 'rls_violation') {
    return { level: 'P0', title: 'RLS violation detected — possible tenant isolation breach' };
  }

  // ── P0: Database connection failure ──
  if (msg.includes('too many clients') || msg.includes('connection refused') || msg.includes('database system is shutting down')) {
    return { level: 'P0', title: 'Database connection failure' };
  }

  // ── P1: Payment processing failures (rate-based) ──
  if (error.path?.includes('/tenders') && error.statusCode === 500) {
    const count = incrementCounter('payment_failure');
    if (count >= 3) {
      return { level: 'P0', title: 'Payment processing failures — 3+ in 5 minutes' };
    }
    return { level: 'P1', title: 'Payment processing failure' };
  }

  // ── P1: Order creation failures (rate-based) ──
  if (error.path?.includes('/orders') && error.statusCode === 500) {
    const count = incrementCounter('order_failure');
    if (count >= 5) {
      return { level: 'P1', title: 'Order creation failure rate elevated — 5+ in 5 minutes' };
    }
  }

  // ── P2: Slow query warning ──
  if (msg.includes('query timeout') || msg.includes('statement timeout')) {
    return { level: 'P2', title: 'Slow query timeout detected' };
  }

  // 5xx errors get rate-checked
  if (error.statusCode && error.statusCode >= 500) {
    const count = incrementCounter('5xx');
    if (count >= 20) {
      return { level: 'P0', title: '5xx error rate critical — 20+ in 5 minutes' };
    }
    if (count >= 5) {
      return { level: 'P1', title: '5xx error rate elevated — 5+ in 5 minutes' };
    }
  }

  return null; // No alert needed
}

/**
 * Classify and send alert for an error if it meets threshold.
 * Call this from the route handler wrapper on 5xx errors.
 */
export async function classifyAndAlert(error: {
  code?: string;
  message?: string;
  statusCode?: number;
  path?: string;
  tenantId?: string;
  requestId?: string;
}): Promise<void> {
  const classification = classifyError(error);
  if (!classification) return;

  await sendAlert({
    level: classification.level,
    title: classification.title,
    details: `Path: ${error.path}\nCode: ${error.code}\nMessage: ${error.message}`,
    tenantId: error.tenantId,
    context: { requestId: error.requestId, statusCode: error.statusCode },
  });
}
