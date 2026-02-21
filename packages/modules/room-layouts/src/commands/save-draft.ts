import { eq, and, desc } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms, floorPlanVersions } from '../schema';
import type { SaveDraftInput } from '../validation';
import { computeSnapshotStats } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function saveDraft(
  ctx: RequestContext,
  roomId: string,
  input: SaveDraftInput,
) {
  const version = await publishWithOutbox(ctx, async (tx) => {
    // No idempotency — autosave calls this frequently

    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    const { objectCount, totalCapacity } = computeSnapshotStats(input.snapshotJson);

    let versionRow;

    if (room.draftVersionId) {
      // Update existing draft
      const [updated] = await tx
        .update(floorPlanVersions)
        .set({
          snapshotJson: input.snapshotJson,
          objectCount,
          totalCapacity,
          updatedAt: new Date(),
        })
        .where(eq(floorPlanVersions.id, room.draftVersionId))
        .returning();
      versionRow = updated!;
    } else {
      // Create new draft version
      const [latestVersion] = await tx
        .select({ versionNumber: floorPlanVersions.versionNumber })
        .from(floorPlanVersions)
        .where(eq(floorPlanVersions.roomId, roomId))
        .orderBy(desc(floorPlanVersions.versionNumber))
        .limit(1);

      const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

      const [created] = await tx
        .insert(floorPlanVersions)
        .values({
          tenantId: ctx.tenantId,
          roomId,
          versionNumber: nextVersion,
          status: 'draft',
          snapshotJson: input.snapshotJson,
          objectCount,
          totalCapacity,
          createdBy: ctx.user.id,
        })
        .returning();

      versionRow = created!;

      // Update room.draftVersionId
      await tx
        .update(floorPlanRooms)
        .set({ draftVersionId: versionRow.id, updatedAt: new Date() })
        .where(eq(floorPlanRooms.id, roomId));
    }

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.VERSION_SAVED, {
      versionId: versionRow.id,
      roomId,
      versionNumber: versionRow.versionNumber,
      objectCount,
      totalCapacity,
    });

    return { result: versionRow, events: [event] };
  });

  return version;
}
