/**
 * Start cleaning — transition an assignment to in_progress.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsHousekeepingAssignments } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function startCleaning(ctx: RequestContext, assignmentId: string) {
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

    if (existing.status !== 'pending') {
      throw new AppError('INVALID_STATUS', `Assignment is ${existing.status}, expected pending`, 409);
    }

    const now = new Date();
    await tx
      .update(pmsHousekeepingAssignments)
      .set({ status: 'in_progress', startedAt: now, updatedAt: now })
      .where(eq(pmsHousekeepingAssignments.id, assignmentId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'housekeeping_assignment', assignmentId, 'started', {
      status: { before: existing.status, after: 'in_progress' },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.HOUSEKEEPING_STARTED, {
      assignmentId,
      propertyId: existing.propertyId,
      roomId: existing.roomId,
      housekeeperId: existing.housekeeperId,
      businessDate: existing.businessDate,
    });

    return { result: { id: assignmentId, status: 'in_progress' }, events: [event] };
  });

  await auditLog(ctx, 'pms.housekeeping.started', 'pms_housekeeping_assignment', assignmentId);
  return result;
}
