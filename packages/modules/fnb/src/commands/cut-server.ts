import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbServerAssignments, fnbShiftExtensions } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CutServerInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function cutServer(
  ctx: RequestContext,
  input: CutServerInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'cutServer',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [assignment] = await (tx as any)
      .select()
      .from(fnbServerAssignments)
      .where(and(
        eq(fnbServerAssignments.id, input.assignmentId),
        eq(fnbServerAssignments.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!assignment) throw new NotFoundError('Assignment', input.assignmentId);

    if (assignment.status !== 'active') {
      throw new AppError(
        'ASSIGNMENT_NOT_ACTIVE',
        `Assignment is already in status '${assignment.status}'`,
        409,
      );
    }

    const [updated] = await (tx as any)
      .update(fnbServerAssignments)
      .set({
        status: 'cut',
        cutAt: new Date(),
        cutBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(fnbServerAssignments.id, input.assignmentId))
      .returning();

    // Also update shift extension status to 'cut' if exists
    await (tx as any)
      .update(fnbShiftExtensions)
      .set({ shiftStatus: 'cut', updatedAt: new Date() })
      .where(and(
        eq(fnbShiftExtensions.tenantId, ctx.tenantId),
        eq(fnbShiftExtensions.serverUserId, assignment.serverUserId),
        eq(fnbShiftExtensions.businessDate, assignment.businessDate),
        eq(fnbShiftExtensions.shiftStatus, 'serving'),
      ));

    const event = buildEventFromContext(ctx, FNB_EVENTS.SERVER_CUT, {
      assignmentId: input.assignmentId,
      sectionId: assignment.sectionId,
      serverUserId: assignment.serverUserId,
      locationId: assignment.locationId,
      cutBy: ctx.user.id,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'cutServer', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.server.cut', 'fnb_server_assignments', input.assignmentId);
  return result;
}
