import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms, floorPlanVersions } from '../schema';
import { generateRoomSlug, reassignObjectIds, computeSnapshotStats } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

interface DuplicateRoomInput {
  name: string;
  locationId?: string;
}

export async function duplicateRoom(
  ctx: RequestContext,
  sourceRoomId: string,
  input: DuplicateRoomInput,
) {
  const room = await publishWithOutbox(ctx, async (tx) => {
    // Fetch source room
    const [source] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, sourceRoomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!source) throw new NotFoundError('Room', sourceRoomId);

    const locationId = input.locationId ?? source.locationId;
    const slug = generateRoomSlug(input.name);

    // Create new room
    const [created] = await tx
      .insert(floorPlanRooms)
      .values({
        tenantId: ctx.tenantId,
        locationId,
        name: input.name,
        slug,
        description: source.description,
        widthFt: source.widthFt,
        heightFt: source.heightFt,
        gridSizeFt: source.gridSizeFt,
        scalePxPerFt: source.scalePxPerFt,
        unit: source.unit,
        defaultMode: source.defaultMode,
        createdBy: ctx.user.id,
      })
      .returning();

    // Copy snapshot from current published or draft version
    const versionSourceId = source.currentVersionId ?? source.draftVersionId;
    if (versionSourceId) {
      const [sourceVersion] = await tx
        .select()
        .from(floorPlanVersions)
        .where(eq(floorPlanVersions.id, versionSourceId))
        .limit(1);

      if (sourceVersion) {
        const newSnapshot = reassignObjectIds(sourceVersion.snapshotJson as Record<string, unknown>);
        const { objectCount, totalCapacity } = computeSnapshotStats(newSnapshot);

        const [draftVersion] = await tx
          .insert(floorPlanVersions)
          .values({
            tenantId: ctx.tenantId,
            roomId: created!.id,
            versionNumber: 1,
            status: 'draft',
            snapshotJson: newSnapshot,
            objectCount,
            totalCapacity,
            createdBy: ctx.user.id,
          })
          .returning();

        await tx
          .update(floorPlanRooms)
          .set({ draftVersionId: draftVersion!.id })
          .where(eq(floorPlanRooms.id, created!.id));
      }
    }

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.ROOM_CREATED, {
      roomId: created!.id,
      locationId,
      name: input.name,
      slug,
      widthFt: Number(source.widthFt),
      heightFt: Number(source.heightFt),
      unit: source.unit,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.room.duplicated', 'floor_plan_room', room.id, undefined, {
    sourceRoomId,
  });
  return room;
}
