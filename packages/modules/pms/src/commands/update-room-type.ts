import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsRoomTypes } from '@oppsera/db';
import type { UpdateRoomTypeInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateRoomType(
  ctx: RequestContext,
  roomTypeId: string,
  input: UpdateRoomTypeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing room type
    const [existing] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.id, roomTypeId),
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Room type', roomTypeId);
    }

    // Validate maxOccupancy >= maxAdults when either is being updated
    const effectiveMaxAdults = input.maxAdults ?? existing.maxAdults;
    const effectiveMaxOccupancy = input.maxOccupancy ?? existing.maxOccupancy;
    if (effectiveMaxOccupancy < effectiveMaxAdults) {
      throw new ValidationError('maxOccupancy must be greater than or equal to maxAdults', [
        { field: 'maxOccupancy', message: `maxOccupancy (${effectiveMaxOccupancy}) must be >= maxAdults (${effectiveMaxAdults})` },
      ]);
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.maxAdults !== undefined) updates.maxAdults = input.maxAdults;
    if (input.maxChildren !== undefined) updates.maxChildren = input.maxChildren;
    if (input.maxOccupancy !== undefined) updates.maxOccupancy = input.maxOccupancy;
    if (input.bedsJson !== undefined) updates.bedsJson = input.bedsJson;
    if (input.amenitiesJson !== undefined) updates.amenitiesJson = input.amenitiesJson;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(pmsRoomTypes)
      .set(updates)
      .where(and(eq(pmsRoomTypes.id, roomTypeId), eq(pmsRoomTypes.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.maxAdults !== undefined && existing.maxAdults !== updated!.maxAdults) {
      diff.maxAdults = { before: existing.maxAdults, after: updated!.maxAdults };
    }
    if (input.maxChildren !== undefined && existing.maxChildren !== updated!.maxChildren) {
      diff.maxChildren = { before: existing.maxChildren, after: updated!.maxChildren };
    }
    if (input.maxOccupancy !== undefined && existing.maxOccupancy !== updated!.maxOccupancy) {
      diff.maxOccupancy = { before: existing.maxOccupancy, after: updated!.maxOccupancy };
    }
    if (input.sortOrder !== undefined && existing.sortOrder !== updated!.sortOrder) {
      diff.sortOrder = { before: existing.sortOrder, after: updated!.sortOrder };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'room_type', roomTypeId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_TYPE_UPDATED, {
      roomTypeId,
      propertyId: existing.propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.room_type.updated', 'pms_room_type', roomTypeId);

  return result;
}
