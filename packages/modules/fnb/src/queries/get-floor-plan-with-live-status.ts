import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { GetFloorPlanWithStatusFilterInput } from '../validation';

export interface FloorPlanTableWithStatus {
  tableId: string;
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
  sectionId: string | null;
  // Live status
  status: string;
  currentTabId: string | null;
  currentServerUserId: string | null;
  seatedAt: string | null;
  partySize: number | null;
  guestNames: string | null;
  combineGroupId: string | null;
  version: number;
}

export interface FloorPlanWithLiveStatus {
  room: {
    id: string;
    name: string;
    slug: string;
    locationId: string;
    widthFt: number;
    heightFt: number;
    gridSizeFt: number;
    scalePxPerFt: number;
    defaultMode: string | null;
    capacity: number | null;
  };
  version: {
    id: string;
    versionNumber: number;
    snapshotJson: Record<string, unknown>;
    publishedAt: string | null;
  } | null;
  tables: FloorPlanTableWithStatus[];
  combineGroups: Array<{
    id: string;
    primaryTableId: string;
    combinedCapacity: number;
    tableIds: string[];
  }>;
}

/**
 * Returns the floor plan room data with the published snapshot AND live table statuses.
 * This is the primary query for the F&B POS floor plan view.
 *
 * The frontend uses snapshotJson to render the visual layout,
 * then overlays live table statuses on top of each table object.
 */
export async function getFloorPlanWithLiveStatus(
  input: GetFloorPlanWithStatusFilterInput,
): Promise<FloorPlanWithLiveStatus> {
  return withTenant(input.tenantId, async (tx) => {
    // Get room info
    const roomRows = await tx.execute(sql`
      SELECT
        r.id, r.name, r.slug, r.location_id,
        r.width_ft, r.height_ft, r.grid_size_ft, r.scale_px_per_ft,
        r.default_mode, r.capacity,
        r.current_version_id
      FROM floor_plan_rooms r
      WHERE r.id = ${input.roomId}
        AND r.tenant_id = ${input.tenantId}
        AND r.is_active = true
      LIMIT 1
    `);

    const rooms = Array.from(roomRows as Iterable<Record<string, unknown>>);
    if (rooms.length === 0) throw new NotFoundError('Room', input.roomId);
    const room = rooms[0]!;

    // Get published version with snapshot
    let versionData = null;
    if (room.current_version_id) {
      const versionRows = await tx.execute(sql`
        SELECT id, version_number, snapshot_json, published_at
        FROM floor_plan_versions
        WHERE id = ${String(room.current_version_id)}
          AND tenant_id = ${input.tenantId}
        LIMIT 1
      `);
      const versions = Array.from(versionRows as Iterable<Record<string, unknown>>);
      if (versions.length > 0) {
        const v = versions[0]!;
        versionData = {
          id: String(v.id),
          versionNumber: Number(v.version_number),
          snapshotJson: v.snapshot_json as Record<string, unknown>,
          publishedAt: v.published_at ? String(v.published_at) : null,
        };
      }
    }

    // Get all active tables with live status
    const tableRows = await tx.execute(sql`
      SELECT
        t.id AS table_id,
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
        t.section_id,
        COALESCE(ls.status, 'available') AS status,
        ls.current_tab_id,
        ls.current_server_user_id,
        ls.seated_at,
        ls.party_size,
        ls.guest_names,
        ls.combine_group_id,
        COALESCE(ls.version, 1) AS version
      FROM fnb_tables t
      LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      WHERE t.room_id = ${input.roomId}
        AND t.tenant_id = ${input.tenantId}
        AND t.is_active = true
      ORDER BY t.sort_order ASC, t.table_number ASC
    `);

    const tables = Array.from(tableRows as Iterable<Record<string, unknown>>).map((row) => ({
      tableId: String(row.table_id),
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
      sectionId: row.section_id ? String(row.section_id) : null,
      status: String(row.status),
      currentTabId: row.current_tab_id ? String(row.current_tab_id) : null,
      currentServerUserId: row.current_server_user_id ? String(row.current_server_user_id) : null,
      seatedAt: row.seated_at ? String(row.seated_at) : null,
      partySize: row.party_size != null ? Number(row.party_size) : null,
      guestNames: row.guest_names ? String(row.guest_names) : null,
      combineGroupId: row.combine_group_id ? String(row.combine_group_id) : null,
      version: Number(row.version),
    }));

    // Get active combine groups
    const groupRows = await tx.execute(sql`
      SELECT
        cg.id,
        cg.primary_table_id,
        cg.combined_capacity,
        ARRAY_AGG(cm.table_id ORDER BY cm.is_primary DESC) AS table_ids
      FROM fnb_table_combine_groups cg
      INNER JOIN fnb_table_combine_members cm ON cm.combine_group_id = cg.id
      WHERE cg.tenant_id = ${input.tenantId}
        AND cg.location_id = ${String(room.location_id)}
        AND cg.status = 'active'
      GROUP BY cg.id, cg.primary_table_id, cg.combined_capacity
    `);

    const combineGroups = Array.from(groupRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      primaryTableId: String(row.primary_table_id),
      combinedCapacity: Number(row.combined_capacity),
      tableIds: (row.table_ids as string[]) ?? [],
    }));

    return {
      room: {
        id: String(room.id),
        name: String(room.name),
        slug: String(room.slug),
        locationId: String(room.location_id),
        widthFt: Number(room.width_ft),
        heightFt: Number(room.height_ft),
        gridSizeFt: Number(room.grid_size_ft),
        scalePxPerFt: Number(room.scale_px_per_ft),
        defaultMode: room.default_mode ? String(room.default_mode) : null,
        capacity: room.capacity != null ? Number(room.capacity) : null,
      },
      version: versionData,
      tables,
      combineGroups,
    };
  });
}
