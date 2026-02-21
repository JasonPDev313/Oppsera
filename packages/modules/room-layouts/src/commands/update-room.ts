import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { ConflictError, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms } from '../schema';
import type { UpdateRoomInput } from '../validation';
import { generateRoomSlug } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function updateRoom(ctx: RequestContext, roomId: string, input: UpdateRoomInput) {
  const room = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateRoom');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [existing] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Room', roomId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updates.name = input.name;
      const newSlug = generateRoomSlug(input.name);
      // Check slug uniqueness if slug changed
      if (newSlug !== existing.slug) {
        const [conflict] = await tx
          .select()
          .from(floorPlanRooms)
          .where(
            and(
              eq(floorPlanRooms.tenantId, ctx.tenantId),
              eq(floorPlanRooms.locationId, existing.locationId),
              eq(floorPlanRooms.slug, newSlug),
            ),
          )
          .limit(1);
        if (conflict) throw new ConflictError(`Room with name "${input.name}" already exists at this location`);
        updates.slug = newSlug;
      }
      changes.name = input.name;
    }

    if (input.description !== undefined) { updates.description = input.description; changes.description = input.description; }
    if (input.widthFt !== undefined) { updates.widthFt = String(input.widthFt); changes.widthFt = input.widthFt; }
    if (input.heightFt !== undefined) { updates.heightFt = String(input.heightFt); changes.heightFt = input.heightFt; }
    if (input.gridSizeFt !== undefined) { updates.gridSizeFt = String(input.gridSizeFt); changes.gridSizeFt = input.gridSizeFt; }
    if (input.scalePxPerFt !== undefined) { updates.scalePxPerFt = input.scalePxPerFt; changes.scalePxPerFt = input.scalePxPerFt; }
    if (input.unit !== undefined) { updates.unit = input.unit; changes.unit = input.unit; }
    if (input.defaultMode !== undefined) { updates.defaultMode = input.defaultMode; changes.defaultMode = input.defaultMode; }
    if (input.sortOrder !== undefined) { updates.sortOrder = input.sortOrder; changes.sortOrder = input.sortOrder; }

    const [updated] = await tx
      .update(floorPlanRooms)
      .set(updates)
      .where(eq(floorPlanRooms.id, roomId))
      .returning();

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.ROOM_UPDATED, {
      roomId: updated!.id,
      locationId: updated!.locationId,
      name: updated!.name,
      changes,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateRoom', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.room.updated', 'floor_plan_room', room.id);
  return room;
}
