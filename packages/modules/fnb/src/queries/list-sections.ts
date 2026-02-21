import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListSectionsFilterInput } from '../validation';

export interface SectionListItem {
  id: string;
  roomId: string;
  roomName: string;
  locationId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  tableCount: number;
}

export async function listSections(
  input: ListSectionsFilterInput,
): Promise<SectionListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const roomFilter = input.roomId
      ? sql`AND s.room_id = ${input.roomId}`
      : sql``;

    const locationFilter = input.locationId
      ? sql`AND s.location_id = ${input.locationId}`
      : sql``;

    const activeFilter = input.isActive !== undefined
      ? sql`AND s.is_active = ${input.isActive}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        s.id,
        s.room_id,
        r.name AS room_name,
        s.location_id,
        s.name,
        s.color,
        s.sort_order,
        s.is_active,
        COUNT(t.id)::int AS table_count
      FROM fnb_sections s
      INNER JOIN floor_plan_rooms r ON r.id = s.room_id
      LEFT JOIN fnb_tables t ON t.section_id = s.id AND t.is_active = true
      WHERE s.tenant_id = ${input.tenantId}
        ${roomFilter}
        ${locationFilter}
        ${activeFilter}
      GROUP BY s.id, r.name
      ORDER BY s.sort_order ASC, s.name ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      roomName: String(row.room_name),
      locationId: String(row.location_id),
      name: String(row.name),
      color: row.color ? String(row.color) : null,
      sortOrder: Number(row.sort_order),
      isActive: Boolean(row.is_active),
      tableCount: Number(row.table_count),
    }));
  });
}
