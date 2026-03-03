import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ServerLoadSnapshot } from '../services/server-recommender';

export interface GetServerLoadSnapshotInput {
  tenantId: string;
  locationId: string;
  businessDate?: string;
}

/**
 * Read the current server load snapshots for a location.
 *
 * Defaults to today's business date when not specified.
 * Returns an empty array when no snapshot has been generated yet.
 */
export async function getServerLoadSnapshot(
  input: GetServerLoadSnapshotInput,
): Promise<ServerLoadSnapshot[]> {
  const businessDate = input.businessDate ?? new Date().toISOString().slice(0, 10);

  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        server_user_id,
        open_tab_count,
        active_seated_count,
        total_cover_count,
        avg_ticket_cents,
        section_id,
        section_capacity
      FROM fnb_server_load_snapshots
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND business_date = ${businessDate}
      ORDER BY total_cover_count ASC, server_user_id ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      serverUserId: String(row.server_user_id),
      openTabCount: Number(row.open_tab_count),
      activeSeatedCount: Number(row.active_seated_count),
      totalCoverCount: Number(row.total_cover_count),
      avgTicketCents: Number(row.avg_ticket_cents),
      sectionId: row.section_id ? String(row.section_id) : null,
      sectionCapacity: row.section_capacity != null ? Number(row.section_capacity) : null,
    }));
  });
}
