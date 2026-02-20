import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms, floorPlanVersions } from '../schema';
import type { PublishVersionInput } from '../validation';
import { computeSnapshotStats } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function publishVersion(
  ctx: RequestContext,
  roomId: string,
  input: PublishVersionInput,
) {
  const version = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'publishVersion');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);
    if (!room.draftVersionId) throw new ValidationError('No draft version to publish');

    // Get draft version
    const [draft] = await tx
      .select()
      .from(floorPlanVersions)
      .where(eq(floorPlanVersions.id, room.draftVersionId))
      .limit(1);
    if (!draft) throw new NotFoundError('Draft version', room.draftVersionId);

    const now = new Date();

    // Archive current published version if exists
    if (room.currentVersionId) {
      await tx
        .update(floorPlanVersions)
        .set({ status: 'archived', updatedAt: now })
        .where(eq(floorPlanVersions.id, room.currentVersionId));
    }

    // Publish the draft
    const [published] = await tx
      .update(floorPlanVersions)
      .set({
        status: 'published',
        publishedAt: now,
        publishedBy: ctx.user.id,
        publishNote: input.publishNote ?? null,
        updatedAt: now,
      })
      .where(eq(floorPlanVersions.id, draft.id))
      .returning();

    // Compute capacity from snapshot
    const { totalCapacity } = computeSnapshotStats(published!.snapshotJson as Record<string, unknown>);

    // Update room: set currentVersionId, clear draftVersionId, update capacity
    await tx
      .update(floorPlanRooms)
      .set({
        currentVersionId: published!.id,
        draftVersionId: null,
        capacity: totalCapacity,
        updatedAt: now,
      })
      .where(eq(floorPlanRooms.id, roomId));

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.VERSION_PUBLISHED, {
      versionId: published!.id,
      roomId,
      versionNumber: published!.versionNumber,
      objectCount: published!.objectCount,
      totalCapacity: published!.totalCapacity,
      publishNote: input.publishNote ?? null,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'publishVersion', published);

    return { result: published!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.version.published', 'floor_plan_version', version.id);
  return version;
}
