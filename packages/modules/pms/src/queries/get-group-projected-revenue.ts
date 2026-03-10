import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GroupRevenueByRoomType {
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  projectedRooms: number;
  confirmedRooms: number;
  projectedRevenueCents: number;
  confirmedRevenueCents: number;
  washFactor: number; // 0–1, how many projected rooms are still unpicked
}

export interface GroupProjectedRevenueResult {
  groupId: string;
  groupName: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  nights: number;
  byRoomType: GroupRevenueByRoomType[];
  totals: {
    projectedRooms: number;
    confirmedRooms: number;
    projectedRevenueCents: number;
    confirmedRevenueCents: number;
    revenueAtRiskCents: number;
    pickupPct: number;
  };
}

export async function getGroupProjectedRevenue(
  tenantId: string,
  groupId: string,
): Promise<GroupProjectedRevenueResult> {
  return withTenant(tenantId, async (tx) => {
    const groupRows = await tx.execute(sql`
      SELECT id, name, property_id, start_date, end_date, negotiated_rate_cents
      FROM pms_groups
      WHERE id = ${groupId} AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const gArr = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (gArr.length === 0) throw new NotFoundError('Group', groupId);
    const group = gArr[0]!;

    const startDate = new Date(String(group.start_date));
    const endDate = new Date(String(group.end_date));
    const nights = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Blocks per room type (projected)
    const blockRows = await tx.execute(sql`
      SELECT
        b.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        SUM(b.rooms_blocked) AS total_blocked,
        SUM(b.rooms_picked_up) AS total_picked_up
      FROM pms_group_room_blocks b
      INNER JOIN pms_room_types rt ON rt.id = b.room_type_id AND rt.tenant_id = b.tenant_id
      WHERE b.tenant_id = ${tenantId}
        AND b.group_id = ${groupId}
        AND b.released = false
      GROUP BY b.room_type_id, rt.code, rt.name
    `);
    const blockArr = Array.from(blockRows as Iterable<Record<string, unknown>>);

    // Confirmed revenue from actual reservations per room type
    const resRows = await tx.execute(sql`
      SELECT
        room_type_id,
        COUNT(*) AS res_count,
        COALESCE(SUM(total_cents), 0) AS confirmed_revenue
      FROM pms_reservations
      WHERE tenant_id = ${tenantId}
        AND group_id = ${groupId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW')
      GROUP BY room_type_id
    `);
    const resArr = Array.from(resRows as Iterable<Record<string, unknown>>);
    const resMap = new Map<string, { count: number; revenue: number }>();
    for (const r of resArr) {
      resMap.set(String(r.room_type_id), {
        count: Number(r.res_count),
        revenue: Number(r.confirmed_revenue),
      });
    }

    const negotiatedRate = group.negotiated_rate_cents != null ? Number(group.negotiated_rate_cents) : 0;

    const byRoomType: GroupRevenueByRoomType[] = blockArr.map((b) => {
      const rtId = String(b.room_type_id);
      const projectedRooms = Number(b.total_blocked);
      const confirmedData = resMap.get(rtId);
      const confirmedRooms = confirmedData?.count ?? 0;
      const confirmedRevenueCents = confirmedData?.revenue ?? 0;
      const projectedRevenueCents = projectedRooms * nights * negotiatedRate;
      const washFactor = projectedRooms > 0 ? (projectedRooms - confirmedRooms) / projectedRooms : 0;

      return {
        roomTypeId: rtId,
        roomTypeCode: String(b.room_type_code),
        roomTypeName: String(b.room_type_name),
        projectedRooms,
        confirmedRooms,
        projectedRevenueCents,
        confirmedRevenueCents,
        washFactor: Math.round(washFactor * 1000) / 1000,
      };
    });

    const totals = byRoomType.reduce(
      (acc, rt) => ({
        projectedRooms: acc.projectedRooms + rt.projectedRooms,
        confirmedRooms: acc.confirmedRooms + rt.confirmedRooms,
        projectedRevenueCents: acc.projectedRevenueCents + rt.projectedRevenueCents,
        confirmedRevenueCents: acc.confirmedRevenueCents + rt.confirmedRevenueCents,
        revenueAtRiskCents:
          acc.revenueAtRiskCents + rt.projectedRevenueCents - rt.confirmedRevenueCents,
        pickupPct: 0,
      }),
      { projectedRooms: 0, confirmedRooms: 0, projectedRevenueCents: 0, confirmedRevenueCents: 0, revenueAtRiskCents: 0, pickupPct: 0 },
    );
    totals.pickupPct =
      totals.projectedRooms > 0
        ? Math.round((totals.confirmedRooms / totals.projectedRooms) * 1000) / 10
        : 0;

    return {
      groupId,
      groupName: String(group.name),
      propertyId: String(group.property_id),
      startDate: String(group.start_date),
      endDate: String(group.end_date),
      nights,
      byRoomType,
      totals,
    };
  });
}
