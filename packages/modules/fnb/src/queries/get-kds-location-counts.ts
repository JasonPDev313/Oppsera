import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface KdsLocationCount {
  locationId: string;
  activeTicketCount: number;
}

/**
 * Returns the count of active KDS tickets (pending/in_progress/ready)
 * grouped by location. Lightweight query for location selector badges.
 */
export async function getKdsLocationCounts(
  tenantId: string,
  locationIds: string[],
): Promise<KdsLocationCount[]> {
  if (locationIds.length === 0) return [];

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT location_id, COUNT(*)::integer AS cnt
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${tenantId}
            AND location_id IN (${sql.join(locationIds.map((id) => sql`${id}`), sql`, `)})
            AND status IN ('pending', 'in_progress', 'ready')
          GROUP BY location_id`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      locationId: r.location_id as string,
      activeTicketCount: Number(r.cnt),
    }));
  });
}
