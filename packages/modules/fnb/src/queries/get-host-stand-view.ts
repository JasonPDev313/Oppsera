import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetHostStandViewInput } from '../validation';

export interface ServerOnFloor {
  serverUserId: string;
  serverName: string | null;
  sectionNames: string[];
  coversServed: number;
  openTabCount: number;
  totalSalesCents: number;
  shiftStatus: string;
}

export interface HostStandView {
  servers: ServerOnFloor[];
  nextUpServerUserId: string | null;
  rotationOrder: string[];
  availableTableCount: number;
  seatedTableCount: number;
  totalTableCount: number;
}

/**
 * Comprehensive host-stand view: servers on floor, covers, rotation, table counts.
 * Hot path for seating decisions.
 */
export async function getHostStandView(
  input: GetHostStandViewInput,
): Promise<HostStandView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get all active servers with their sections and stats
    const serverRows = await tx.execute(sql`
      SELECT
        a.server_user_id,
        u.name AS server_name,
        ARRAY_AGG(DISTINCT s.name) AS section_names,
        COALESCE(se.covers_served, 0)::int AS covers_served,
        COALESCE(se.open_tab_count, 0)::int AS open_tab_count,
        COALESCE(se.total_sales_cents, 0)::int AS total_sales_cents,
        COALESCE(se.shift_status, 'serving') AS shift_status
      FROM fnb_server_assignments a
      INNER JOIN fnb_sections s ON s.id = a.section_id
      LEFT JOIN users u ON u.id = a.server_user_id
      LEFT JOIN fnb_shift_extensions se ON se.server_user_id = a.server_user_id
        AND se.tenant_id = a.tenant_id
        AND se.business_date = a.business_date
      WHERE a.tenant_id = ${input.tenantId}
        AND a.location_id = ${input.locationId}
        AND a.business_date = ${input.businessDate}
        AND a.status = 'active'
      GROUP BY a.server_user_id, u.name, se.covers_served, se.open_tab_count,
               se.total_sales_cents, se.shift_status
      ORDER BY COALESCE(se.covers_served, 0) ASC
    `);

    const servers = Array.from(serverRows as Iterable<Record<string, unknown>>).map((row) => ({
      serverUserId: String(row.server_user_id),
      serverName: row.server_name ? String(row.server_name) : null,
      sectionNames: (row.section_names as string[]) ?? [],
      coversServed: Number(row.covers_served),
      openTabCount: Number(row.open_tab_count),
      totalSalesCents: Number(row.total_sales_cents),
      shiftStatus: String(row.shift_status),
    }));

    // Get rotation tracker
    const rotationRows = await tx.execute(sql`
      SELECT next_server_user_id, rotation_order
      FROM fnb_rotation_tracker
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND business_date = ${input.businessDate}
      LIMIT 1
    `);

    const rotation = Array.from(rotationRows as Iterable<Record<string, unknown>>);
    const nextUpServerUserId = rotation.length > 0
      ? String(rotation[0]!.next_server_user_id)
      : (servers.length > 0 ? servers[0]!.serverUserId : null);
    const rotationOrder = rotation.length > 0
      ? (rotation[0]!.rotation_order as string[]) ?? []
      : servers.map((s) => s.serverUserId);

    // Get table counts
    const tableRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE ls.status = 'available')::int AS available_count,
        COUNT(*) FILTER (WHERE ls.status IN ('seated', 'ordered', 'entrees_fired', 'dessert', 'check_presented'))::int AS seated_count
      FROM fnb_tables t
      LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.is_active = true
    `);

    const tableCounts = Array.from(tableRows as Iterable<Record<string, unknown>>);
    const tc = tableCounts[0] ?? { total_count: 0, available_count: 0, seated_count: 0 };

    return {
      servers,
      nextUpServerUserId,
      rotationOrder,
      availableTableCount: Number(tc.available_count),
      seatedTableCount: Number(tc.seated_count),
      totalTableCount: Number(tc.total_count),
    };
  });
}
