/**
 * Housekeeping command to update room status.
 */
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { and, eq } from 'drizzle-orm';
import { pmsRooms } from '@oppsera/db';
import type { UpdateRoomHousekeepingInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { transitionRoomStatus } from '../helpers/transition-room-status';

export async function updateRoomStatus(
  ctx: RequestContext,
  roomId: string,
  input: UpdateRoomHousekeepingInput,
) {
  if (input.status === 'OUT_OF_ORDER' && !input.reason) {
    throw new ValidationError('Reason required for OUT_OF_ORDER status', [
      { field: 'reason', message: 'Reason is required when setting OUT_OF_ORDER' },
    ]);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [room] = await tx
      .select()
      .from(pmsRooms)
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    const fromStatus = room.status;
    const businessDate = new Date().toISOString().split('T')[0]!;

    await transitionRoomStatus(tx, ctx.tenantId, roomId, input.status, ctx.user.id, businessDate, input.reason);

    await pmsAuditLogEntry(tx, ctx, roomId, 'room', roomId, 'status_changed', {
      fromStatus,
      toStatus: input.status,
      reason: input.reason ?? null,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_STATUS_CHANGED, {
      roomId,
      propertyId: room.propertyId,
      fromStatus,
      toStatus: input.status,
      reason: input.reason ?? null,
      businessDate,
    });

    return { result: { roomId, status: input.status }, events: [event] };
  });

  await auditLog(ctx, 'pms.room.status_changed', 'pms_room', roomId);
  return result;
}
