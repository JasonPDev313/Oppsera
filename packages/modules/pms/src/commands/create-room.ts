import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsProperties, pmsRoomTypes, pmsRooms } from '@oppsera/db';
import type { CreateRoomInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createRoom(ctx: RequestContext, input: CreateRoomInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate property exists and belongs to tenant
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    // Validate room type exists and belongs to same property
    const [roomType] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.id, input.roomTypeId),
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, input.propertyId),
        ),
      )
      .limit(1);

    if (!roomType) {
      throw new NotFoundError('Room type', input.roomTypeId);
    }

    // Validate room number uniqueness within property
    const [existingRoom] = await tx
      .select()
      .from(pmsRooms)
      .where(
        and(
          eq(pmsRooms.tenantId, ctx.tenantId),
          eq(pmsRooms.propertyId, input.propertyId),
          eq(pmsRooms.roomNumber, input.roomNumber),
        ),
      )
      .limit(1);

    if (existingRoom) {
      throw new ConflictError(`Room number "${input.roomNumber}" already exists for this property`);
    }

    const [created] = await tx
      .insert(pmsRooms)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        roomTypeId: input.roomTypeId,
        roomNumber: input.roomNumber,
        floor: input.floor ?? null,
        status: 'VACANT_CLEAN',
        isOutOfOrder: false,
        featuresJson: input.featuresJson ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'room', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_CREATED, {
      roomId: created!.id,
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      roomNumber: created!.roomNumber,
      status: created!.status,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.room.created', 'pms_room', result.id);

  return result;
}
