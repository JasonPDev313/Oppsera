/**
 * List housekeeping assignments for a property + business date.
 * Joins room name from pmsRooms and housekeeper name from pmsHousekeepers.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HousekeepingAssignmentItem {
  id: string;
  propertyId: string;
  roomId: string;
  roomNumber: string;
  housekeeperId: string;
  housekeeperName: string;
  businessDate: string;
  priority: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
}

export async function listHousekeepingAssignments(
  tenantId: string,
  propertyId: string,
  businessDate: string,
  housekeeperId?: string,
): Promise<HousekeepingAssignmentItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        a.id,
        a.property_id,
        a.room_id,
        r.room_number,
        a.housekeeper_id,
        h.name AS housekeeper_name,
        a.business_date,
        a.priority,
        a.status,
        a.started_at,
        a.completed_at,
        a.duration_minutes,
        a.notes,
        a.created_at
      FROM pms_housekeeping_assignments a
      JOIN pms_rooms r ON r.id = a.room_id AND r.tenant_id = a.tenant_id
      JOIN pms_housekeepers h ON h.id = a.housekeeper_id AND h.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenantId}
        AND a.property_id = ${propertyId}
        AND a.business_date = ${businessDate}
        ${housekeeperId ? sql`AND a.housekeeper_id = ${housekeeperId}` : sql``}
      ORDER BY a.priority ASC, r.room_number ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      propertyId: String(row.property_id),
      roomId: String(row.room_id),
      roomNumber: String(row.room_number),
      housekeeperId: String(row.housekeeper_id),
      housekeeperName: String(row.housekeeper_name),
      businessDate: String(row.business_date),
      priority: Number(row.priority),
      status: String(row.status),
      startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
      durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
      notes: row.notes ? String(row.notes) : null,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));
  });
}
