/**
 * Skip cleaning — mark an assignment as skipped with an optional reason.
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

export async function skipCleaning(ctx: RequestContext, assignmentId: string, reason?: string) {
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

    if (existing.status === 'completed' || existing.status === 'skipped') {
      throw new AppError('INVALID_STATUS', `Assignment is already ${existing.status}`, 409);
    }

    const now = new Date();
    await tx
      .update(pmsHousekeepingAssignments)
      .set({
        status: 'skipped',
        notes: reason ?? null,
        updatedAt: now,
      })
      .where(eq(pmsHousekeepingAssignments.id, assignmentId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'housekeeping_assignment', assignmentId, 'skipped', {
      status: { before: existing.status, after: 'skipped' },
      reason: reason ?? null,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.HOUSEKEEPING_SKIPPED, {
      assignmentId,
      propertyId: existing.propertyId,
      roomId: existing.roomId,
      housekeeperId: existing.housekeeperId,
      businessDate: existing.businessDate,
      reason: reason ?? null,
    });

    return { result: { id: assignmentId, status: 'skipped' }, events: [event] };
  });

  await auditLog(ctx, 'pms.housekeeping.skipped', 'pms_housekeeping_assignment', assignmentId);
  return result;
}
