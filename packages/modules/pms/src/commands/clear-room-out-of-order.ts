import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRooms, pmsRoomBlocks } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function clearRoomOutOfOrder(
  ctx: RequestContext,
  roomId: string,
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

    const previousReason = existing.outOfOrderReason;

    // Update room status to VACANT_DIRTY (returned to service needs cleaning)
    const [updated] = await tx
      .update(pmsRooms)
      .set({
        status: 'VACANT_DIRTY',
        isOutOfOrder: false,
        outOfOrderReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .returning();

    // Deactivate all active maintenance blocks for this room
    const deactivatedBlocks = await tx
      .update(pmsRoomBlocks)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pmsRoomBlocks.tenantId, ctx.tenantId),
          eq(pmsRoomBlocks.roomId, roomId),
          eq(pmsRoomBlocks.blockType, 'MAINTENANCE'),
          eq(pmsRoomBlocks.isActive, true),
        ),
      )
      .returning();

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'room', roomId, 'out_of_order_cleared', {
      status: { before: 'OUT_OF_ORDER', after: 'VACANT_DIRTY' },
      reason: { before: previousReason, after: null },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_OUT_OF_ORDER_CLEARED, {
      roomId,
      propertyId: existing.propertyId,
      roomNumber: existing.roomNumber,
      previousReason,
      blocksDeactivated: deactivatedBlocks.length,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.room.out_of_order_cleared', 'pms_room', roomId);

  return result;
}
