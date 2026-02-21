import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms } from '../schema';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function archiveRoom(
  ctx: RequestContext,
  roomId: string,
  reason?: string,
) {
  const room = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Room', roomId);

    const [updated] = await tx
      .update(floorPlanRooms)
      .set({
        isActive: false,
        archivedAt: new Date(),
        archivedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(floorPlanRooms.id, roomId))
      .returning();

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.ROOM_ARCHIVED, {
      roomId: updated!.id,
      locationId: updated!.locationId,
      name: updated!.name,
      reason: reason ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.room.archived', 'floor_plan_room', room.id);
  return room;
}
