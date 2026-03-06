import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ServerForTransferItem {
  id: string;
  name: string;
  openTabCount: number;
}

/**
 * List servers available as transfer targets for a location.
 * Includes any user who has active section assignments OR open tabs at the location.
 */
export async function listServersForTransfer(input: {
  tenantId: string;
  locationId?: string;
}): Promise<ServerForTransferItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND t.location_id = ${input.locationId}`
      : sql``;

    const assignmentLocationFilter = input.locationId
      ? sql`AND a.location_id = ${input.locationId}`
      : sql``;

    // Union of servers from active section assignments and servers with open tabs
    const rows = await tx.execute(sql`
      WITH server_ids AS (
        SELECT DISTINCT a.server_user_id AS uid
        FROM fnb_server_assignments a
        WHERE a.tenant_id = ${input.tenantId}
          AND a.status = 'active'
          AND a.business_date = CURRENT_DATE
          ${assignmentLocationFilter}
        UNION
        SELECT DISTINCT t.server_user_id AS uid
        FROM fnb_tabs t
        WHERE t.tenant_id = ${input.tenantId}
          AND t.status IN ('open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested')
          AND t.server_user_id IS NOT NULL
          ${locationFilter}
      )
      SELECT
        s.uid AS id,
        COALESCE(u.display_name, u.name, u.email, 'Unknown') AS name,
        COALESCE(tc.cnt, 0)::int AS open_tab_count
      FROM server_ids s
      LEFT JOIN users u ON u.id = s.uid
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM fnb_tabs t
        WHERE t.tenant_id = ${input.tenantId}
          AND t.server_user_id = s.uid
          AND t.status IN ('open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested')
          ${locationFilter}
      ) tc ON true
      ORDER BY name ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      openTabCount: Number(row.open_tab_count),
    }));
  });
}
