/**
 * Housekeeping productivity report.
 */
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { rmPmsHousekeepingProductivity } from '@oppsera/db';

export interface HousekeepingProductivityRow {
  housekeeperId: string;
  totalRoomsCleaned: number;
  totalMinutes: number;
  avgMinutesPerRoom: number;
}

export async function getHousekeepingProductivity(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HousekeepingProductivityRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        housekeeperId: rmPmsHousekeepingProductivity.housekeeperId,
        totalRoomsCleaned: sql<number>`sum(${rmPmsHousekeepingProductivity.roomsCleaned})::int`,
        totalMinutes: sql<number>`sum(${rmPmsHousekeepingProductivity.totalMinutes})::int`,
      })
      .from(rmPmsHousekeepingProductivity)
      .where(
        and(
          eq(rmPmsHousekeepingProductivity.tenantId, tenantId),
          eq(rmPmsHousekeepingProductivity.propertyId, propertyId),
          gte(rmPmsHousekeepingProductivity.businessDate, startDate),
          lte(rmPmsHousekeepingProductivity.businessDate, endDate),
        ),
      )
      .groupBy(rmPmsHousekeepingProductivity.housekeeperId)
      .orderBy(desc(sql`sum(${rmPmsHousekeepingProductivity.roomsCleaned})`));

    return rows.map((r) => ({
      housekeeperId: r.housekeeperId,
      totalRoomsCleaned: r.totalRoomsCleaned ?? 0,
      totalMinutes: r.totalMinutes ?? 0,
      avgMinutesPerRoom: (r.totalRoomsCleaned ?? 0) > 0 ? Math.round((r.totalMinutes ?? 0) / (r.totalRoomsCleaned ?? 1)) : 0,
    }));
  });
}
