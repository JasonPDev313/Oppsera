import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbSections, floorPlanRooms } from '@oppsera/db';
import { ConflictError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateSectionInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { RoomNotFoundError } from '../errors';

export async function createSection(
  ctx: RequestContext,
  input: CreateSectionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createSection',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate room exists
    const [room] = await (tx as any)
      .select()
      .from(floorPlanRooms)
      .where(and(
        eq(floorPlanRooms.id, input.roomId),
        eq(floorPlanRooms.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!room) throw new RoomNotFoundError(input.roomId);

    // Check for duplicate section name in room
    const [existing] = await (tx as any)
      .select()
      .from(fnbSections)
      .where(and(
        eq(fnbSections.tenantId, ctx.tenantId),
        eq(fnbSections.roomId, input.roomId),
        eq(fnbSections.name, input.name),
      ))
      .limit(1);
    if (existing) throw new ConflictError(`Section '${input.name}' already exists in this room`);

    const [created] = await (tx as any)
      .insert(fnbSections)
      .values({
        tenantId: ctx.tenantId,
        locationId: room.locationId,
        roomId: input.roomId,
        name: input.name,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SECTION_CREATED, {
      sectionId: created!.id,
      roomId: input.roomId,
      locationId: room.locationId,
      name: input.name,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createSection', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.section.created', 'fnb_sections', result.id);
  return result;
}
