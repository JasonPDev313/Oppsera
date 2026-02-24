import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetRoomSectionAssignmentsFilterInput } from '../validation';

export interface RoomSectionAssignment {
  serverUserId: string;
  serverName: string | null;
  tableIds: string[];
}

export async function getRoomSectionAssignments(
  input: GetRoomSectionAssignmentsFilterInput,
): Promise<RoomSectionAssignment[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        m.server_user_id,
        u.display_name AS server_name,
        ARRAY_AGG(m.table_id) AS table_ids
      FROM fnb_my_section_tables m
      LEFT JOIN users u ON u.id = m.server_user_id AND u.tenant_id = m.tenant_id
      WHERE m.tenant_id = ${input.tenantId}
        AND m.room_id = ${input.roomId}
        AND m.business_date = ${input.businessDate}
      GROUP BY m.server_user_id, u.display_name
      ORDER BY u.display_name ASC NULLS LAST
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      serverUserId: String(r.server_user_id),
      serverName: r.server_name ? String(r.server_name) : null,
      tableIds: Array.isArray(r.table_ids)
        ? (r.table_ids as string[]).map(String)
        : [],
    }));
  });
}
