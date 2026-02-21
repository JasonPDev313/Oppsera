import { withTenant, sql } from '@oppsera/db';

export interface DailyOccupancyRow {
  businessDate: string;
  totalRooms: number;
  roomsOccupied: number;
  roomsAvailable: number;
  roomsOoo: number;
  arrivals: number;
  departures: number;
  occupancyPct: number;
  adrCents: number;
  revparCents: number;
}

export async function getDailyOccupancy(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<DailyOccupancyRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT business_date, total_rooms, rooms_occupied, rooms_available,
             rooms_ooo, arrivals, departures, occupancy_pct,
             adr_cents, revpar_cents
      FROM rm_pms_daily_occupancy
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
      ORDER BY business_date
    `);

    return Array.from(rows as Iterable<any>).map((r) => ({
      businessDate: r.business_date as string,
      totalRooms: r.total_rooms as number,
      roomsOccupied: r.rooms_occupied as number,
      roomsAvailable: r.rooms_available as number,
      roomsOoo: r.rooms_ooo as number,
      arrivals: r.arrivals as number,
      departures: r.departures as number,
      occupancyPct: Number(r.occupancy_pct),
      adrCents: r.adr_cents as number,
      revparCents: r.revpar_cents as number,
    }));
  });
}
