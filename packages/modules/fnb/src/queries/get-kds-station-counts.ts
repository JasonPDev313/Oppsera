import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface KdsStationCount {
  stationId: string;
  activeTicketCount: number;
}

/**
 * Returns the count of active KDS ticket items (pending/in_progress)
 * grouped by station. Lightweight query for station selector badges.
 */
export async function getKdsStationCounts(
  tenantId: string,
  locationId: string,
): Promise<KdsStationCount[]> {
  if (!locationId) return [];

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT kti.station_id,
                 COUNT(DISTINCT kti.ticket_id)::integer AS cnt
          FROM fnb_kitchen_ticket_items kti
          JOIN fnb_kitchen_tickets kt
            ON kt.id = kti.ticket_id AND kt.tenant_id = kti.tenant_id
          WHERE kti.tenant_id = ${tenantId}
            AND kt.location_id = ${locationId}
            AND kt.status IN ('pending', 'in_progress')
            AND kti.item_status NOT IN ('served', 'voided', 'bumped')
            AND kti.station_id IS NOT NULL
          GROUP BY kti.station_id`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      stationId: r.station_id as string,
      activeTicketCount: Number(r.cnt),
    }));
  });
}
