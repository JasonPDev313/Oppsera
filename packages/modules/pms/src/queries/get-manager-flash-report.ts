/**
 * Manager flash report — KPIs for a single business date.
 */
import { and, eq, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsReservations, pmsRooms, pmsFolioEntries, pmsFolios } from '@oppsera/db';

export interface ManagerFlashReport {
  businessDate: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  adrCents: number;
  revParCents: number;
  arrivals: number;
  departures: number;
  stayovers: number;
  outOfOrder: number;
  totalRevenueCents: number;
}

export async function getManagerFlashReport(
  tenantId: string,
  propertyId: string,
  businessDate: string,
): Promise<ManagerFlashReport> {
  return withTenant(tenantId, async (tx) => {
    // Total rooms
    const [roomCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pmsRooms)
      .where(and(eq(pmsRooms.tenantId, tenantId), eq(pmsRooms.propertyId, propertyId)));
    const totalRooms = roomCount?.count ?? 0;

    // OOO rooms (using isOutOfOrder boolean)
    const [oooCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pmsRooms)
      .where(
        and(
          eq(pmsRooms.tenantId, tenantId),
          eq(pmsRooms.propertyId, propertyId),
          eq(pmsRooms.isOutOfOrder, true),
        ),
      );
    const outOfOrder = oooCount?.count ?? 0;

    // Active reservations for this date
    const reservations = await tx
      .select({
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        status: pmsReservations.status,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          sql`${pmsReservations.checkInDate} <= ${businessDate}`,
          sql`${pmsReservations.checkOutDate} > ${businessDate}`,
          sql`${pmsReservations.status} NOT IN ('CANCELLED', 'NO_SHOW')`,
        ),
      );

    const occupiedRooms = reservations.length;
    let arrivals = 0;
    let stayovers = 0;

    for (const r of reservations) {
      if (r.checkInDate === businessDate) arrivals++;
      else stayovers++;
    }

    // Departures (checkout on this date)
    const [depCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          eq(pmsReservations.checkOutDate, businessDate),
          sql`${pmsReservations.status} NOT IN ('CANCELLED', 'NO_SHOW')`,
        ),
      );
    const departures = depCount?.count ?? 0;

    // Revenue from folio entries for this date (join through pmsFolios for propertyId)
    const [revenueRow] = await tx
      .select({
        total: sql<number>`coalesce(sum(${pmsFolioEntries.amountCents}), 0)::int`,
      })
      .from(pmsFolioEntries)
      .innerJoin(pmsFolios, eq(pmsFolioEntries.folioId, pmsFolios.id))
      .where(
        and(
          eq(pmsFolioEntries.tenantId, tenantId),
          eq(pmsFolios.propertyId, propertyId),
          eq(pmsFolioEntries.businessDate, businessDate),
          sql`${pmsFolioEntries.entryType} = 'charge'`,
        ),
      );
    const totalRevenueCents = revenueRow?.total ?? 0;

    const adrCents = occupiedRooms > 0 ? Math.round(totalRevenueCents / occupiedRooms) : 0;
    const revParCents = totalRooms > 0 ? Math.round(totalRevenueCents / totalRooms) : 0;

    return {
      businessDate,
      totalRooms,
      occupiedRooms,
      occupancyPct: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 10000) / 100 : 0,
      adrCents,
      revParCents,
      arrivals,
      departures,
      stayovers,
      outOfOrder,
      totalRevenueCents,
    };
  });
}
