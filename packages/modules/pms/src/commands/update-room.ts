import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsRooms, pmsRoomTypes } from '@oppsera/db';
import type { UpdateRoomInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateRoom(
  ctx: RequestContext,
  roomId: string,
  input: UpdateRoomInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing room
    const [existing] = await tx
      .select()
      .from(pmsRooms)
      .where(
        and(
          eq(pmsRooms.id, roomId),
          eq(pmsRooms.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Room', roomId);
    }

    // If changing room type, validate it exists and belongs to same property
    if (input.roomTypeId !== undefined) {
      const [roomType] = await tx
        .select()
        .from(pmsRoomTypes)
        .where(
          and(
            eq(pmsRoomTypes.id, input.roomTypeId),
            eq(pmsRoomTypes.tenantId, ctx.tenantId),
            eq(pmsRoomTypes.propertyId, existing.propertyId),
          ),
        )
        .limit(1);

      if (!roomType) {
        throw new NotFoundError('Room type', input.roomTypeId);
      }
    }

    // If changing room number, validate uniqueness within property
    if (input.roomNumber !== undefined && input.roomNumber !== existing.roomNumber) {
      const [conflict] = await tx
        .select()
        .from(pmsRooms)
        .where(
          and(
            eq(pmsRooms.tenantId, ctx.tenantId),
            eq(pmsRooms.propertyId, existing.propertyId),
            eq(pmsRooms.roomNumber, input.roomNumber),
          ),
        )
        .limit(1);

      if (conflict) {
        throw new ConflictError(`Room number "${input.roomNumber}" already exists for this property`);
      }
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.roomNumber !== undefined) updates.roomNumber = input.roomNumber;
    if (input.floor !== undefined) updates.floor = input.floor;
    if (input.roomTypeId !== undefined) updates.roomTypeId = input.roomTypeId;
    if (input.featuresJson !== undefined) updates.featuresJson = input.featuresJson;

    const [updated] = await tx
      .update(pmsRooms)
      .set(updates)
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.roomNumber !== undefined && existing.roomNumber !== updated!.roomNumber) {
      diff.roomNumber = { before: existing.roomNumber, after: updated!.roomNumber };
    }
    if (input.floor !== undefined && existing.floor !== updated!.floor) {
      diff.floor = { before: existing.floor, after: updated!.floor };
    }
    if (input.roomTypeId !== undefined && existing.roomTypeId !== updated!.roomTypeId) {
      diff.roomTypeId = { before: existing.roomTypeId, after: updated!.roomTypeId };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'room', roomId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_UPDATED, {
      roomId,
      propertyId: existing.propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.room.updated', 'pms_room', roomId);

  return result;
}
