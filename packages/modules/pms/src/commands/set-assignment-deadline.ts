/**
 * Set a "clean by X time" deadline on a housekeeping assignment.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsHousekeepingAssignments } from '@oppsera/db';
import type { SetAssignmentDeadlineInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setAssignmentDeadline(
  ctx: RequestContext,
  assignmentId: string,
  input: SetAssignmentDeadlineInput,
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

    if (existing.status === 'completed' || existing.status === 'skipped') {
      throw new AppError('INVALID_STATUS', `Cannot set deadline on ${existing.status} assignment`, 409);
    }

    const now = new Date();
    const dueBy = new Date(input.dueBy);
    if (isNaN(dueBy.getTime())) {
      throw new AppError('INVALID_INPUT', 'dueBy is not a valid date', 400);
    }
    await tx
      .update(pmsHousekeepingAssignments)
      .set({
        dueBy,
        requestedBy: input.requestedBy ?? null,
        updatedAt: now,
      })
      .where(and(eq(pmsHousekeepingAssignments.id, assignmentId), eq(pmsHousekeepingAssignments.tenantId, ctx.tenantId)));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'housekeeping_assignment', assignmentId, 'deadline_set', {
      dueBy: dueBy.toISOString(),
      requestedBy: input.requestedBy ?? null,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.HOUSEKEEPING_DEADLINE_SET, {
      assignmentId,
      propertyId: existing.propertyId,
      roomId: existing.roomId,
      housekeeperId: existing.housekeeperId,
      businessDate: existing.businessDate,
      dueBy: dueBy.toISOString(),
      requestedBy: input.requestedBy ?? null,
    });

    return {
      result: { id: assignmentId, dueBy: dueBy.toISOString(), requestedBy: input.requestedBy ?? null },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'pms.housekeeping.deadline_set', 'pms_housekeeping_assignment', assignmentId);
  return result;
}
