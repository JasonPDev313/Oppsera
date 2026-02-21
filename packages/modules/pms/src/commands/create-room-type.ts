import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError, ValidationError } from '@oppsera/shared';
import { pmsProperties, pmsRoomTypes } from '@oppsera/db';
import type { CreateRoomTypeInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createRoomType(ctx: RequestContext, input: CreateRoomTypeInput) {
  // Validate maxOccupancy >= maxAdults
  const maxAdults = input.maxAdults ?? 2;
  const maxOccupancy = input.maxOccupancy ?? 2;
  if (maxOccupancy < maxAdults) {
    throw new ValidationError('maxOccupancy must be greater than or equal to maxAdults', [
      { field: 'maxOccupancy', message: `maxOccupancy (${maxOccupancy}) must be >= maxAdults (${maxAdults})` },
    ]);
  }

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

    // Validate code uniqueness within property
    const [existingCode] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, input.propertyId),
          eq(pmsRoomTypes.code, input.code),
        ),
      )
      .limit(1);

    if (existingCode) {
      throw new ConflictError(`Room type with code "${input.code}" already exists for this property`);
    }

    const [created] = await tx
      .insert(pmsRoomTypes)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        maxAdults,
        maxChildren: input.maxChildren ?? 0,
        maxOccupancy,
        bedsJson: input.bedsJson ?? null,
        amenitiesJson: input.amenitiesJson ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'room_type', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_TYPE_CREATED, {
      roomTypeId: created!.id,
      propertyId: input.propertyId,
      code: created!.code,
      name: created!.name,
      maxOccupancy: created!.maxOccupancy,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.room_type.created', 'pms_room_type', result.id);

  return result;
}
