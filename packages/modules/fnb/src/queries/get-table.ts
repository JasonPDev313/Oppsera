import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface FnbTableDetail {
  id: string;
  roomId: string;
  locationId: string;
  floorPlanObjectId: string | null;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  isCombinable: boolean;
  isActive: boolean;
  sectionId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  // Live status
  status: string;
  currentTabId: string | null;
  currentServerUserId: string | null;
  seatedAt: string | null;
  partySize: number | null;
  guestNames: string | null;
  combineGroupId: string | null;
  waitlistEntryId: string | null;
  estimatedTurnTimeMinutes: number | null;
  version: number;
  // Room info
  roomName: string;
}

export async function getTable(
  tenantId: string,
  tableId: string,
): Promise<FnbTableDetail> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        t.id,
        t.room_id,
        t.location_id,
        t.floor_plan_object_id,
        t.table_number,
        t.display_label,
        t.capacity_min,
        t.capacity_max,
        t.table_type,
        t.shape,
        t.position_x,
        t.position_y,
        t.width,
        t.height,
        t.rotation,
        t.is_combinable,
        t.is_active,
        t.section_id,
        t.sort_order,
        t.created_at,
        t.updated_at,
        t.created_by,
        COALESCE(ls.status, 'available') AS status,
        ls.current_tab_id,
        ls.current_server_user_id,
        ls.seated_at,
        ls.party_size,
        ls.guest_names,
        ls.combine_group_id,
        ls.waitlist_entry_id,
        ls.estimated_turn_time_minutes,
        COALESCE(ls.version, 1) AS version,
        r.name AS room_name
      FROM fnb_tables t
      LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      LEFT JOIN floor_plan_rooms r ON r.id = t.room_id
      WHERE t.id = ${tableId}
        AND t.tenant_id = ${tenantId}
      LIMIT 1
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new NotFoundError('Table', tableId);

    const row = items[0]!;
    return {
      id: String(row.id),
      roomId: String(row.room_id),
      locationId: String(row.location_id),
      floorPlanObjectId: row.floor_plan_object_id ? String(row.floor_plan_object_id) : null,
      tableNumber: Number(row.table_number),
      displayLabel: String(row.display_label),
      capacityMin: Number(row.capacity_min),
      capacityMax: Number(row.capacity_max),
      tableType: String(row.table_type),
      shape: String(row.shape),
      positionX: Number(row.position_x),
      positionY: Number(row.position_y),
      width: Number(row.width),
      height: Number(row.height),
      rotation: Number(row.rotation),
      isCombinable: Boolean(row.is_combinable),
      isActive: Boolean(row.is_active),
      sectionId: row.section_id ? String(row.section_id) : null,
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      createdBy: row.created_by ? String(row.created_by) : null,
      status: String(row.status),
      currentTabId: row.current_tab_id ? String(row.current_tab_id) : null,
      currentServerUserId: row.current_server_user_id ? String(row.current_server_user_id) : null,
      seatedAt: row.seated_at ? String(row.seated_at) : null,
      partySize: row.party_size != null ? Number(row.party_size) : null,
      guestNames: row.guest_names ? String(row.guest_names) : null,
      combineGroupId: row.combine_group_id ? String(row.combine_group_id) : null,
      waitlistEntryId: row.waitlist_entry_id ? String(row.waitlist_entry_id) : null,
      estimatedTurnTimeMinutes: row.estimated_turn_time_minutes != null
        ? Number(row.estimated_turn_time_minutes) : null,
      version: Number(row.version),
      roomName: String(row.room_name),
    };
  });
}
