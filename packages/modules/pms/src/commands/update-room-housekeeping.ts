/**
 * Housekeeping room status update command.
 * Uses shared transitionRoomStatus helper to avoid code duplication.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRooms } from '@oppsera/db';
import type { UpdateRoomHousekeepingInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { transitionRoomStatus } from '../helpers/transition-room-status';

export async function updateRoomHousekeeping(
  ctx: RequestContext,
  roomId: string,
  input: UpdateRoomHousekeepingInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
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
    const today = new Date().toISOString().split('T')[0]!;

    // Use shared helper for transition + update + status log
    await transitionRoomStatus(tx, ctx.tenantId, roomId, input.status, ctx.user.id, today, input.reason);

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'room', roomId, 'status_changed', {
      status: { before: previousStatus, after: input.status },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.ROOM_STATUS_CHANGED, {
      roomId,
      propertyId: existing.propertyId,
      roomNumber: existing.roomNumber,
      fromStatus: previousStatus,
      toStatus: input.status,
      reason: input.reason ?? null,
    });

    return { result: { roomId, status: input.status }, events: [event] };
  });

  await auditLog(ctx, 'pms.room.status_changed', 'pms_room', roomId);
  return result;
}
