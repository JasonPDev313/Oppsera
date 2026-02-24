/**
 * Complete cleaning — mark an assignment as completed, update room clean status.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsHousekeepingAssignments, pmsRooms } from '@oppsera/db';
import type { CompleteCleaningInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function completeCleaning(
  ctx: RequestContext,
  assignmentId: string,
  input: CompleteCleaningInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsHousekeepingAssignments)
      .where(
        and(
          eq(pmsHousekeepingAssignments.id, assignmentId),
          eq(pmsHousekeepingAssignments.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('HousekeepingAssignment', assignmentId);

    if (existing.status !== 'in_progress' && existing.status !== 'pending') {
      throw new AppError('INVALID_STATUS', `Assignment is ${existing.status}, expected in_progress or pending`, 409);
    }

    const now = new Date();
    let durationMinutes: number | null = null;
    if (existing.startedAt) {
      durationMinutes = Math.round((now.getTime() - existing.startedAt.getTime()) / 60_000);
    }

    await tx
      .update(pmsHousekeepingAssignments)
      .set({
        status: 'completed',
        completedAt: now,
        durationMinutes,
        notes: input.notes ?? existing.notes,
        updatedAt: now,
      })
      .where(eq(pmsHousekeepingAssignments.id, assignmentId));

    // Update room clean status
    await tx
      .update(pmsRooms)
      .set({
        lastCleanedAt: now,
        lastCleanedBy: existing.housekeeperId,
        status: 'VACANT_CLEAN',
        updatedAt: now,
      })
      .where(
        and(
          eq(pmsRooms.id, existing.roomId),
          eq(pmsRooms.tenantId, ctx.tenantId),
        ),
      );

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'housekeeping_assignment', assignmentId, 'completed', {
      status: { before: existing.status, after: 'completed' },
      durationMinutes,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.HOUSEKEEPING_COMPLETED, {
      assignmentId,
      propertyId: existing.propertyId,
      roomId: existing.roomId,
      housekeeperId: existing.housekeeperId,
      businessDate: existing.businessDate,
      durationMinutes,
    });

    return { result: { id: assignmentId, status: 'completed', durationMinutes }, events: [event] };
  });

  await auditLog(ctx, 'pms.housekeeping.completed', 'pms_housekeeping_assignment', assignmentId);
  return result;
}
