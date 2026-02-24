import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTables, fnbTableLiveStatus, floorPlanRooms, floorPlanVersions } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { SyncTablesFromFloorPlanInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { RoomNotFoundError, NoPublishedVersionError } from '../errors';
import { extractTablesFromSnapshot } from '../helpers/extract-tables-from-snapshot';

/**
 * Syncs F&B table entities from a published floor plan version.
 *
 * This is the key bridge between the Room Layouts module (design-time)
 * and the F&B module (runtime). It reads the published snapshot_json,
 * extracts table objects, and upserts fnb_tables rows.
 *
 * Rules:
 * - New tables in the snapshot → INSERT into fnb_tables + fnb_table_live_status
 * - Existing tables (matched by floorPlanObjectId) → UPDATE position/capacity
 * - Tables removed from snapshot → mark isActive=false (soft deactivate)
 * - Table numbers auto-assigned if missing (max+1 per room)
 */
export async function syncTablesFromFloorPlan(
  ctx: RequestContext,
  input: SyncTablesFromFloorPlanInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'syncTablesFromFloorPlan',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate room exists and belongs to tenant
    const [room] = await (tx as any)
      .select()
      .from(floorPlanRooms)
      .where(
        and(
          eq(floorPlanRooms.id, input.roomId),
          eq(floorPlanRooms.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!room) throw new RoomNotFoundError(input.roomId);
    if (!room.isActive || room.archivedAt) throw new RoomNotFoundError(input.roomId);
    if (!room.currentVersionId) throw new NoPublishedVersionError(input.roomId);

    // Get the published version's snapshot
    const [version] = await (tx as any)
      .select()
      .from(floorPlanVersions)
      .where(eq(floorPlanVersions.id, room.currentVersionId))
      .limit(1);

    if (!version) throw new NoPublishedVersionError(input.roomId);

    const snapshotJson = version.snapshotJson as Record<string, unknown>;
    const snapshotTables = extractTablesFromSnapshot(snapshotJson);

    // Get existing fnb_tables for this room
    const existingTables = await (tx as any)
      .select()
      .from(fnbTables)
      .where(
        and(
          eq(fnbTables.tenantId, ctx.tenantId),
          eq(fnbTables.roomId, input.roomId),
        ),
      );

    const existingByObjectId = new Map(
      (existingTables as any[]).map((t: any) => [t.floorPlanObjectId, t]),
    );

    // Find max table number for auto-assignment
    let maxTableNumber = Math.max(
      0,
      ...(existingTables as any[]).map((t: any) => t.tableNumber),
    );

    const snapshotObjectIds = new Set(snapshotTables.map((t) => t.floorPlanObjectId));

    let tablesCreated = 0;
    let tablesUpdated = 0;
    let tablesDeactivated = 0;

    // Process snapshot tables: create or update
    for (const st of snapshotTables) {
      const existing = existingByObjectId.get(st.floorPlanObjectId);

      if (existing) {
        // UPDATE existing table's position/capacity from snapshot
        await (tx as any)
          .update(fnbTables)
          .set({
            positionX: String(st.positionX),
            positionY: String(st.positionY),
            width: String(st.width),
            height: String(st.height),
            rotation: String(st.rotation),
            capacityMin: st.capacityMin,
            capacityMax: st.capacityMax,
            shape: st.shape,
            displayLabel: st.displayLabel,
            isCombinable: st.isCombinable,
            isActive: true, // reactivate if was soft-deactivated
            updatedAt: new Date(),
          })
          .where(eq(fnbTables.id, existing.id));

        tablesUpdated++;
      } else {
        // Assign table number: use snapshot's if > 0, else auto-increment
        let tableNumber = st.tableNumber;
        if (tableNumber <= 0) {
          maxTableNumber++;
          tableNumber = maxTableNumber;
        } else {
          maxTableNumber = Math.max(maxTableNumber, tableNumber);
        }

        // INSERT new table
        const [created] = await (tx as any)
          .insert(fnbTables)
          .values({
            tenantId: ctx.tenantId,
            locationId: room.locationId,
            roomId: input.roomId,
            floorPlanObjectId: st.floorPlanObjectId,
            tableNumber,
            displayLabel: st.displayLabel || `Table ${tableNumber}`,
            capacityMin: st.capacityMin,
            capacityMax: st.capacityMax,
            tableType: 'standard',
            shape: st.shape,
            positionX: String(st.positionX),
            positionY: String(st.positionY),
            width: String(st.width),
            height: String(st.height),
            rotation: String(st.rotation),
            isCombinable: st.isCombinable,
            createdBy: ctx.user.id,
          })
          .returning();

        // Create live status row for the new table
        await (tx as any)
          .insert(fnbTableLiveStatus)
          .values({
            tenantId: ctx.tenantId,
            tableId: created!.id,
            status: 'available',
          });

        tablesCreated++;
      }
    }

    // Soft-deactivate tables removed from the snapshot
    for (const existing of existingTables as any[]) {
      if (
        existing.floorPlanObjectId &&
        !snapshotObjectIds.has(existing.floorPlanObjectId) &&
        existing.isActive
      ) {
        await (tx as any)
          .update(fnbTables)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(fnbTables.id, existing.id));

        tablesDeactivated++;
      }
    }

    const syncResult = {
      roomId: input.roomId,
      versionId: version.id,
      tablesCreated,
      tablesUpdated,
      tablesDeactivated,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLES_SYNCED, {
      ...syncResult,
      locationId: room.locationId,
    });

    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'syncTablesFromFloorPlan',
      syncResult,
    );

    return { result: syncResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tables.synced_from_floor_plan', 'floor_plan_rooms', input.roomId, undefined, {
    tablesCreated: result.tablesCreated,
    tablesUpdated: result.tablesUpdated,
    tablesDeactivated: result.tablesDeactivated,
  });

  return result;
}
