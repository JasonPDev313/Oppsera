import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { ConflictError, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { locations } from '@oppsera/db';
import { floorPlanRooms } from '../schema';
import type { CreateRoomInput } from '../validation';
import { generateRoomSlug } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function createRoom(ctx: RequestContext, input: CreateRoomInput) {
  const room = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createRoom');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate locationId
    const [loc] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.tenantId, ctx.tenantId)))
      .limit(1);
    if (!loc) throw new NotFoundError('Location', input.locationId);

    // Generate slug
    const slug = generateRoomSlug(input.name);

    // Check unique slug per tenant+location
    const [existing] = await tx
      .select()
      .from(floorPlanRooms)
      .where(
        and(
          eq(floorPlanRooms.tenantId, ctx.tenantId),
          eq(floorPlanRooms.locationId, input.locationId),
          eq(floorPlanRooms.slug, slug),
        ),
      )
      .limit(1);
    if (existing) throw new ConflictError(`Room with name "${input.name}" already exists at this location`);

    const [created] = await tx
      .insert(floorPlanRooms)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        widthFt: String(input.widthFt),
        heightFt: String(input.heightFt),
        gridSizeFt: input.gridSizeFt != null ? String(input.gridSizeFt) : undefined,
        scalePxPerFt: input.scalePxPerFt,
        unit: input.unit,
        defaultMode: input.defaultMode,
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.ROOM_CREATED, {
      roomId: created!.id,
      locationId: input.locationId,
      name: input.name,
      slug,
      widthFt: input.widthFt,
      heightFt: input.heightFt,
      unit: input.unit ?? 'feet',
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createRoom', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.room.created', 'floor_plan_room', room.id);
  return room;
}
