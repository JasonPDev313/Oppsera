/**
 * Revenue breakdown by room type for a date range.
 */
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { rmPmsRevenueByRoomType, pmsRoomTypes, pmsRooms } from '@oppsera/db';

export interface RevenueByRoomTypeRow {
  roomTypeId: string;
  roomTypeName: string;
  roomsSold: number;
  roomRevenueCents: number;
  taxRevenueCents: number;
  adrCents: number;
  totalRoomInventory: number;
}

export async function getRevenueByRoomType(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<RevenueByRoomTypeRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        roomTypeId: rmPmsRevenueByRoomType.roomTypeId,
        roomTypeName: pmsRoomTypes.name,
        roomsSold: sql<number>`sum(${rmPmsRevenueByRoomType.roomsSold})::int`,
        roomRevenueCents: sql<number>`sum(${rmPmsRevenueByRoomType.roomRevenueCents})::int`,
        taxRevenueCents: sql<number>`sum(${rmPmsRevenueByRoomType.taxRevenueCents})::int`,
      })
      .from(rmPmsRevenueByRoomType)
      .leftJoin(pmsRoomTypes, eq(rmPmsRevenueByRoomType.roomTypeId, pmsRoomTypes.id))
      .where(
        and(
          eq(rmPmsRevenueByRoomType.tenantId, tenantId),
          eq(rmPmsRevenueByRoomType.propertyId, propertyId),
          gte(rmPmsRevenueByRoomType.businessDate, startDate),
          lte(rmPmsRevenueByRoomType.businessDate, endDate),
        ),
      )
      .groupBy(rmPmsRevenueByRoomType.roomTypeId, pmsRoomTypes.name)
      .orderBy(desc(sql`sum(${rmPmsRevenueByRoomType.roomRevenueCents})`));

    // Count rooms per room type for occupancy calculation
    const roomCounts = await tx
      .select({
        roomTypeId: pmsRooms.roomTypeId,
        count: sql<number>`count(*)::int`,
      })
      .from(pmsRooms)
      .where(
        and(
          eq(pmsRooms.tenantId, tenantId),
          eq(pmsRooms.propertyId, propertyId),
        ),
      )
      .groupBy(pmsRooms.roomTypeId);

    const roomCountMap = new Map(roomCounts.map((rc) => [rc.roomTypeId, rc.count]));

    // Compute number of days in range for occupancy denominator
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return rows.map((r) => {
      const inventory = roomCountMap.get(r.roomTypeId) ?? 0;
      const totalRoomInventory = inventory * days;
      return {
        roomTypeId: r.roomTypeId,
        roomTypeName: r.roomTypeName ?? 'Unknown',
        roomsSold: r.roomsSold ?? 0,
        roomRevenueCents: r.roomRevenueCents ?? 0,
        taxRevenueCents: r.taxRevenueCents ?? 0,
        adrCents: (r.roomsSold ?? 0) > 0 ? Math.round((r.roomRevenueCents ?? 0) / (r.roomsSold ?? 1)) : 0,
        totalRoomInventory,
      };
    });
  });
}
