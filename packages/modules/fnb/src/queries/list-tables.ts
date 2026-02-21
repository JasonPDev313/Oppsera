import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTablesFilterInput } from '../validation';

export interface FnbTableListItem {
  id: string;
  roomId: string;
  locationId: string;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  isCombinable: boolean;
  isActive: boolean;
  sectionId: string | null;
  sortOrder: number;
  // Live status (joined)
  status: string | null;
  currentTabId: string | null;
  currentServerUserId: string | null;
  seatedAt: string | null;
  partySize: number | null;
  combineGroupId: string | null;
  version: number | null;
}

export async function listTables(
  input: ListTablesFilterInput,
): Promise<{ items: FnbTableListItem[]; cursor: string | null; hasMore: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const limit = Math.min(input.limit ?? 100, 200);

    const roomFilter = input.roomId
      ? sql`AND t.room_id = ${input.roomId}`
      : sql``;

    const locationFilter = input.locationId
      ? sql`AND t.location_id = ${input.locationId}`
      : sql``;

    const sectionFilter = input.sectionId
      ? sql`AND t.section_id = ${input.sectionId}`
      : sql``;

    const activeFilter = input.isActive !== undefined
      ? sql`AND t.is_active = ${input.isActive}`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND t.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        t.id,
        t.room_id,
        t.location_id,
        t.table_number,
        t.display_label,
        t.capacity_min,
        t.capacity_max,
        t.table_type,
        t.shape,
        t.is_combinable,
        t.is_active,
        t.section_id,
        t.sort_order,
        ls.status,
        ls.current_tab_id,
        ls.current_server_user_id,
        ls.seated_at,
        ls.party_size,
        ls.combine_group_id,
        ls.version
      FROM fnb_tables t
      LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      WHERE t.tenant_id = ${input.tenantId}
        ${roomFilter}
        ${locationFilter}
        ${sectionFilter}
        ${activeFilter}
        ${cursorFilter}
      ORDER BY t.sort_order ASC, t.table_number ASC, t.id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      locationId: String(row.location_id),
      tableNumber: Number(row.table_number),
      displayLabel: String(row.display_label),
      capacityMin: Number(row.capacity_min),
      capacityMax: Number(row.capacity_max),
      tableType: String(row.table_type),
      shape: String(row.shape),
      isCombinable: Boolean(row.is_combinable),
      isActive: Boolean(row.is_active),
      sectionId: row.section_id ? String(row.section_id) : null,
      sortOrder: Number(row.sort_order),
      status: row.status ? String(row.status) : null,
      currentTabId: row.current_tab_id ? String(row.current_tab_id) : null,
      currentServerUserId: row.current_server_user_id ? String(row.current_server_user_id) : null,
      seatedAt: row.seated_at ? String(row.seated_at) : null,
      partySize: row.party_size != null ? Number(row.party_size) : null,
      combineGroupId: row.combine_group_id ? String(row.combine_group_id) : null,
      version: row.version != null ? Number(row.version) : null,
    }));

    const hasMore = items.length > limit;
    const displayItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? displayItems[displayItems.length - 1]!.id : null;

    return { items: displayItems, cursor: nextCursor, hasMore };
  });
}
