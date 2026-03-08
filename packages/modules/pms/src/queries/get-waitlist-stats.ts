import { eq, and, sql } from 'drizzle-orm';
import { withTenant, pmsWaitlist } from '@oppsera/db';

export interface WaitlistStats {
  totalWaiting: number;
  totalOffered: number;
  totalBooked: number;
  totalExpired: number;
  totalCanceled: number;
  avgWaitHours: number | null;
  conversionRate: number;
  byRoomType: { roomTypeId: string; count: number }[];
}

export async function getWaitlistStats(input: {
  tenantId: string;
  propertyId: string;
  roomTypeId?: string;
}): Promise<WaitlistStats> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(pmsWaitlist.tenantId, input.tenantId),
      eq(pmsWaitlist.propertyId, input.propertyId),
    ];

    if (input.roomTypeId) {
      conditions.push(eq(pmsWaitlist.roomTypeId, input.roomTypeId));
    }

    const whereClause = and(...conditions);

    const [statusCounts, avgWait, roomTypeCounts] = await Promise.all([
      tx
        .select({
          status: pmsWaitlist.status,
          cnt: sql<number>`count(*)::int`,
        })
        .from(pmsWaitlist)
        .where(whereClause)
        .groupBy(pmsWaitlist.status),

      tx
        .select({
          avgHours: sql<number | null>`
            ROUND(
              AVG(
                EXTRACT(EPOCH FROM (${pmsWaitlist.bookedAt} - ${pmsWaitlist.createdAt}))
              ) / 3600.0, 1
            )::numeric
          `,
        })
        .from(pmsWaitlist)
        .where(and(...conditions, eq(pmsWaitlist.status, 'booked'))),

      tx
        .select({
          roomTypeId: pmsWaitlist.roomTypeId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(pmsWaitlist)
        .where(and(...conditions, eq(pmsWaitlist.status, 'waiting')))
        .groupBy(pmsWaitlist.roomTypeId),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) counts[row.status] = row.cnt;

    const totalWaiting = counts['waiting'] ?? 0;
    const totalOffered = counts['offered'] ?? 0;
    const totalBooked = counts['booked'] ?? 0;
    const totalExpired = counts['expired'] ?? 0;
    const totalCanceled = counts['canceled'] ?? 0;

    const terminalTotal = totalBooked + totalExpired + totalCanceled;
    const conversionRate = terminalTotal > 0
      ? Math.round((totalBooked / terminalTotal) * 10000) / 100
      : 0;

    const avgWaitHours = avgWait[0]?.avgHours != null ? Number(avgWait[0].avgHours) : null;

    const byRoomType = roomTypeCounts
      .filter((r) => r.roomTypeId !== null)
      .map((r) => ({ roomTypeId: r.roomTypeId!, count: r.cnt }));

    return {
      totalWaiting,
      totalOffered,
      totalBooked,
      totalExpired,
      totalCanceled,
      avgWaitHours,
      conversionRate,
      byRoomType,
    };
  });
}
