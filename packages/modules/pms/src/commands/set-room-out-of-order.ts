import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsRooms, pmsRoomBlocks } from '@oppsera/db';
import type { SetOutOfOrderInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setRoomOutOfOrder(
  ctx: RequestContext,
  roomId: string,
  input: SetOutOfOrderInput,
) {
  // Reason is required (schema enforces min(1), belt-and-suspenders)
  if (!input.reason || input.reason.trim().length === 0) {
    throw new ValidationError('Reason is required for out-of-order', [
      { field: 'reason', message: 'Reason must be a non-empty string' },
    ]);
  }

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

    const previousStatus = existing.status;

    // Update room status to OUT_OF_ORDER
    const [updated] = await tx
      .update(pmsRooms)
      .set({
        status: 'OUT_OF_ORDER',
        isOutOfOrder: true,
        outOfOrderReason: input.reason,
        updatedAt: new Date(),
      })
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .returning();

    // Determine block dates: use provided dates or default to open-ended (today + 1 year)
    const today = new Date().toISOString().split('T')[0]!;
    const startDate = input.startDate ?? today;
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const endDate = input.endDate ?? oneYearLater;

    // Create room block for the OOO period
    const [block] = await tx
      .insert(pmsRoomBlocks)
      .values({
        tenantId: ctx.tenantId,
        propertyId: existing.propertyId,
        roomId,
        blockType: 'MAINTENANCE',
        startDate,
        endDate,
        reason: input.reason,
        isActive: true,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'room', roomId, 'out_of_order_set', {
      status: { before: previousStatus, after: 'OUT_OF_ORDER' },
      reason: { before: existing.outOfOrderReason, after: input.reason },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_OUT_OF_ORDER_SET, {
      roomId,
      propertyId: existing.propertyId,
      roomNumber: existing.roomNumber,
      reason: input.reason,
      previousStatus,
      blockId: block!.id,
      startDate,
      endDate,
    });

    return { result: { room: updated!, block: block! }, events: [event] };
  });

  await auditLog(ctx, 'pms.room.out_of_order_set', 'pms_room', roomId);

  return result;
}
