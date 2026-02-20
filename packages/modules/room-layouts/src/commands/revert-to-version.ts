import { eq, and, desc } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms, floorPlanVersions } from '../schema';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function revertToVersion(
  ctx: RequestContext,
  roomId: string,
  versionId: string,
) {
  const version = await publishWithOutbox(ctx, async (tx) => {
    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    // Fetch target version
    const [target] = await tx
      .select()
      .from(floorPlanVersions)
      .where(
        and(
          eq(floorPlanVersions.id, versionId),
          eq(floorPlanVersions.roomId, roomId),
        ),
      )
      .limit(1);
    if (!target) throw new NotFoundError('Version', versionId);
    if (target.status !== 'published' && target.status !== 'archived') {
      throw new ValidationError('Can only revert to published or archived versions');
    }

    // Get latest version number
    const [latest] = await tx
      .select({ versionNumber: floorPlanVersions.versionNumber })
      .from(floorPlanVersions)
      .where(eq(floorPlanVersions.roomId, roomId))
      .orderBy(desc(floorPlanVersions.versionNumber))
      .limit(1);

    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    // Create new draft with copied snapshot
    const [created] = await tx
      .insert(floorPlanVersions)
      .values({
        tenantId: ctx.tenantId,
        roomId,
        versionNumber: nextVersion,
        status: 'draft',
        snapshotJson: target.snapshotJson,
        objectCount: target.objectCount,
        totalCapacity: target.totalCapacity,
        createdBy: ctx.user.id,
      })
      .returning();

    // Update room.draftVersionId
    await tx
      .update(floorPlanRooms)
      .set({ draftVersionId: created!.id, updatedAt: new Date() })
      .where(eq(floorPlanRooms.id, roomId));

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.VERSION_REVERTED, {
      versionId: created!.id,
      roomId,
      fromVersionNumber: target.versionNumber,
      toVersionNumber: nextVersion,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.version.reverted', 'floor_plan_version', version.id);
  return version;
}
