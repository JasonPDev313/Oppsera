import { eq, and, sql } from 'drizzle-orm';
import { withTenant, spaWaitlist } from '@oppsera/db';

export interface WaitlistStats {
  totalWaiting: number;
  totalOffered: number;
  totalBooked: number;
  avgWaitMinutes: number | null;
  conversionRate: number;
}

/**
 * Get waitlist statistics for the spa dashboard.
 * Counts entries by status, computes average wait time (created → booked),
 * and calculates conversion rate (booked / terminal states).
 * Optionally filtered by serviceId.
 */
export async function getWaitlistStats(input: {
  tenantId: string;
  serviceId?: string;
}): Promise<WaitlistStats> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaWaitlist.tenantId, input.tenantId),
    ];

    if (input.serviceId) {
      conditions.push(eq(spaWaitlist.serviceId, input.serviceId));
    }

    const whereClause = and(...conditions);

    // Run counts and avg wait time in parallel
    const [statusCounts, avgWait] = await Promise.all([
      // 1. Count entries by status
      tx
        .select({
          status: spaWaitlist.status,
          cnt: sql<number>`count(*)::int`,
        })
        .from(spaWaitlist)
        .where(whereClause)
        .groupBy(spaWaitlist.status),

      // 2. Average wait time in minutes for booked entries (created_at → updated_at)
      // updated_at is the best proxy for when the entry transitioned to 'booked'
      tx
        .select({
          avgMinutes: sql<number | null>`
            ROUND(
              AVG(
                EXTRACT(EPOCH FROM (${spaWaitlist.updatedAt} - ${spaWaitlist.createdAt}))
              ) / 60.0
            )::numeric
          `,
        })
        .from(spaWaitlist)
        .where(
          and(
            ...conditions,
            eq(spaWaitlist.status, 'booked'),
          ),
        ),
    ]);

    // Build counts map from grouped results
    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row.cnt;
    }

    const totalWaiting = counts['waiting'] ?? 0;
    const totalOffered = counts['offered'] ?? 0;
    const totalBooked = counts['booked'] ?? 0;
    const totalExpired = counts['expired'] ?? 0;
    const totalCanceled = counts['canceled'] ?? 0;

    // Conversion rate = booked / (booked + expired + canceled) * 100
    // Only count terminal states in denominator
    const terminalTotal = totalBooked + totalExpired + totalCanceled;
    const conversionRate =
      terminalTotal > 0
        ? Math.round((totalBooked / terminalTotal) * 10000) / 100
        : 0;

    const avgWaitMinutes = avgWait[0]?.avgMinutes != null
      ? Number(avgWait[0].avgMinutes)
      : null;

    return {
      totalWaiting,
      totalOffered,
      totalBooked,
      avgWaitMinutes,
      conversionRate,
    };
  });
}
