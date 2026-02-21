/**
 * Shared room status transition helper.
 * Used by check-in, check-out, and housekeeping commands.
 */
import { and, eq } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { pmsRooms, pmsRoomStatusLog } from '@oppsera/db';
import { assertRoomTransition } from '../state-machines';

export async function transitionRoomStatus(
  tx: any,
  tenantId: string,
  roomId: string,
  toStatus: string,
  actorId: string,
  businessDate: string,
  reason?: string,
): Promise<void> {
  // Load current room
  const [room] = await tx
    .select()
    .from(pmsRooms)
    .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, tenantId)))
    .limit(1);

  if (!room) return;

  const fromStatus = room.status;

  // Validate transition
  assertRoomTransition(fromStatus, toStatus);

  // Update room
  const updates: Record<string, unknown> = { status: toStatus, updatedAt: new Date() };
  if (toStatus === 'OUT_OF_ORDER') {
    updates.isOutOfOrder = true;
  } else if (fromStatus === 'OUT_OF_ORDER') {
    updates.isOutOfOrder = false;
  }

  await tx
    .update(pmsRooms)
    .set(updates)
    .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, tenantId)));

  // Log to pms_room_status_log
  await tx.insert(pmsRoomStatusLog).values({
    id: generateUlid(),
    tenantId,
    propertyId: room.propertyId,
    roomId,
    fromStatus,
    toStatus,
    businessDate,
    changedBy: actorId,
    reason: reason ?? null,
  });
}
