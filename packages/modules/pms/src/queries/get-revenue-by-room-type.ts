/**
 * Revenue breakdown by room type for a date range.
 */
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { rmPmsRevenueByRoomType, pmsRoomTypes } from '@oppsera/db';

export interface RevenueByRoomTypeRow {
  roomTypeId: string;
  roomTypeName: string;
  roomsSold: number;
  roomRevenueCents: number;
  taxRevenueCents: number;
  adrCents: number;
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

    return rows.map((r) => ({
      roomTypeId: r.roomTypeId,
      roomTypeName: r.roomTypeName ?? 'Unknown',
      roomsSold: r.roomsSold ?? 0,
      roomRevenueCents: r.roomRevenueCents ?? 0,
      taxRevenueCents: r.taxRevenueCents ?? 0,
      adrCents: (r.roomsSold ?? 0) > 0 ? Math.round((r.roomRevenueCents ?? 0) / (r.roomsSold ?? 1)) : 0,
    }));
  });
}
