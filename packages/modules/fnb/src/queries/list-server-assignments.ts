import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListServerAssignmentsFilterInput } from '../validation';

export interface ServerAssignmentItem {
  id: string;
  sectionId: string;
  sectionName: string;
  roomName: string;
  serverUserId: string;
  serverName: string | null;
  businessDate: string;
  status: string;
  assignedAt: string;
  cutAt: string | null;
  cutBy: string | null;
  pickedUpBy: string | null;
  pickedUpAt: string | null;
}

export async function listServerAssignments(
  input: ListServerAssignmentsFilterInput,
): Promise<ServerAssignmentItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND a.location_id = ${input.locationId}`
      : sql``;

    const statusFilter = input.status
      ? sql`AND a.status = ${input.status}`
      : sql``;

    const serverFilter = input.serverUserId
      ? sql`AND a.server_user_id = ${input.serverUserId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        a.id,
        a.section_id,
        s.name AS section_name,
        r.name AS room_name,
        a.server_user_id,
        u.name AS server_name,
        a.business_date,
        a.status,
        a.assigned_at,
        a.cut_at,
        a.cut_by,
        a.picked_up_by,
        a.picked_up_at
      FROM fnb_server_assignments a
      INNER JOIN fnb_sections s ON s.id = a.section_id
      INNER JOIN floor_plan_rooms r ON r.id = s.room_id
      LEFT JOIN users u ON u.id = a.server_user_id
      WHERE a.tenant_id = ${input.tenantId}
        AND a.business_date = ${input.businessDate}
        ${locationFilter}
        ${statusFilter}
        ${serverFilter}
      ORDER BY a.assigned_at DESC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      sectionId: String(row.section_id),
      sectionName: String(row.section_name),
      roomName: String(row.room_name),
      serverUserId: String(row.server_user_id),
      serverName: row.server_name ? String(row.server_name) : null,
      businessDate: String(row.business_date),
      status: String(row.status),
      assignedAt: String(row.assigned_at),
      cutAt: row.cut_at ? String(row.cut_at) : null,
      cutBy: row.cut_by ? String(row.cut_by) : null,
      pickedUpBy: row.picked_up_by ? String(row.picked_up_by) : null,
      pickedUpAt: row.picked_up_at ? String(row.picked_up_at) : null,
    }));
  });
}
