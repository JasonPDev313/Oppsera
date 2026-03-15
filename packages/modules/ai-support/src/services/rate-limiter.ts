import { eq, and, sql } from 'drizzle-orm';
import { db, aiAssistantThreads, aiAssistantMessages } from '@oppsera/db';
import {
  MAX_MESSAGES_PER_HOUR,
  MAX_CONCURRENT_THREADS_PER_USER,
  MAX_MESSAGES_PER_THREAD,
} from '../constants';

// ── Types ────────────────────────────────────────────────────────────────────

export type RateLimitType =
  | 'messages_per_hour'
  | 'threads_per_user'
  | 'messages_per_thread';

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds until reset
  current?: number;
  limit?: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

const LIMITS: Record<RateLimitType, { max: number }> = {
  messages_per_hour: { max: MAX_MESSAGES_PER_HOUR },
  threads_per_user: { max: MAX_CONCURRENT_THREADS_PER_USER },
  messages_per_thread: { max: MAX_MESSAGES_PER_THREAD },
};

// ── DB-backed checks ─────────────────────────────────────────────────────────

/**
 * Check whether a user is within the rate limit for the given action type.
 *
 * Unlike the previous in-memory implementation, this queries the actual
 * database tables, so limits are enforced correctly across all Vercel
 * instances.
 *
 * @param tenantId - Tenant scope
 * @param userId   - User to check
 * @param type     - Which limit to check
 * @param threadId - Required for 'messages_per_thread' checks
 */
export async function checkRateLimit(
  tenantId: string,
  userId: string,
  type: RateLimitType,
  threadId?: string,
): Promise<RateLimitResult> {
  const config = LIMITS[type];

  switch (type) {
    case 'messages_per_hour': {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiAssistantMessages)
        .where(
          and(
            eq(aiAssistantMessages.tenantId, tenantId),
            sql`${aiAssistantMessages.threadId} IN (
              SELECT id FROM ai_assistant_threads
              WHERE user_id = ${userId} AND tenant_id = ${tenantId}
            )`,
            eq(aiAssistantMessages.role, 'user'),
            sql`${aiAssistantMessages.createdAt} >= ${oneHourAgo.toISOString()}`,
          ),
        );

      const count = result?.count ?? 0;
      if (count >= config.max) {
        return { allowed: false, retryAfter: 3600, current: count, limit: config.max };
      }
      return { allowed: true, current: count, limit: config.max };
    }

    case 'threads_per_user': {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiAssistantThreads)
        .where(
          and(
            eq(aiAssistantThreads.tenantId, tenantId),
            eq(aiAssistantThreads.userId, userId),
            eq(aiAssistantThreads.status, 'open'),
          ),
        );

      const count = result?.count ?? 0;
      if (count >= config.max) {
        return { allowed: false, current: count, limit: config.max };
      }
      return { allowed: true, current: count, limit: config.max };
    }

    case 'messages_per_thread': {
      if (!threadId) {
        return { allowed: true, current: 0, limit: config.max };
      }

      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiAssistantMessages)
        .where(
          and(
            eq(aiAssistantMessages.threadId, threadId),
            eq(aiAssistantMessages.tenantId, tenantId),
          ),
        );

      const count = result?.count ?? 0;
      if (count >= config.max) {
        return { allowed: false, current: count, limit: config.max };
      }
      return { allowed: true, current: count, limit: config.max };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Record a usage event. With DB-backed limits this is a no-op — the
 * actual insert into ai_assistant_messages/threads IS the usage record.
 * Kept for API compatibility with existing callers.
 */
export function recordUsage(_userId: string, _type: RateLimitType): void {
  // No-op — DB rows are the source of truth now
}

/**
 * Reset rate limit counters for a user. With DB-backed limits, this
 * is a no-op. Thread/message cleanup happens through normal close/delete flows.
 */
export function resetRateLimit(_userId: string, _type?: RateLimitType): void {
  // No-op — DB rows are the source of truth now
}

/**
 * Get current usage stats for a user.
 */
export async function getUsageStats(
  tenantId: string,
  userId: string,
  type: RateLimitType,
  threadId?: string,
): Promise<{ count: number; remaining: number; limit: number }> {
  const result = await checkRateLimit(tenantId, userId, type, threadId);
  const limit = LIMITS[type].max;
  const count = result.current ?? 0;
  return {
    count,
    remaining: Math.max(0, limit - count),
    limit,
  };
}
