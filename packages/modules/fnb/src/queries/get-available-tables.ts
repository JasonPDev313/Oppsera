import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface AvailableTable {
  tableId: string;
  roomId: string;
  roomName: string;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  sectionId: string | null;
}

/**
 * Returns all available tables that can seat a given party size.
 * Hot path for host stand: "find me a table for 4"
 */
export async function getAvailableTables(
  tenantId: string,
  locationId: string,
  partySize?: number,
): Promise<AvailableTable[]> {
  return withTenant(tenantId, async (tx) => {
    const partySizeFilter = partySize
      ? sql`AND t.capacity_max >= ${partySize}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        t.id AS table_id,
        t.room_id,
        r.name AS room_name,
        t.table_number,
        t.display_label,
        t.capacity_min,
        t.capacity_max,
        t.table_type,
        t.shape,
        t.section_id
      FROM fnb_tables t
      INNER JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      INNER JOIN floor_plan_rooms r ON r.id = t.room_id
      WHERE t.tenant_id = ${tenantId}
        AND t.location_id = ${locationId}
        AND t.is_active = true
        AND ls.status = 'available'
        AND ls.combine_group_id IS NULL
        ${partySizeFilter}
      ORDER BY t.capacity_max ASC, t.sort_order ASC, t.table_number ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      tableId: String(row.table_id),
      roomId: String(row.room_id),
      roomName: String(row.room_name),
      tableNumber: Number(row.table_number),
      displayLabel: String(row.display_label),
      capacityMin: Number(row.capacity_min),
      capacityMax: Number(row.capacity_max),
      tableType: String(row.table_type),
      shape: String(row.shape),
      sectionId: row.section_id ? String(row.section_id) : null,
    }));
  });
}
