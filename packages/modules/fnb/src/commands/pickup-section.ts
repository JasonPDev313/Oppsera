import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbServerAssignments } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { PickupSectionInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function pickupSection(
  ctx: RequestContext,
  input: PickupSectionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'pickupSection',
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

    if (assignment.status !== 'cut') {
      throw new AppError(
        'ASSIGNMENT_NOT_CUT',
        `Cannot pick up assignment in status '${assignment.status}' — must be cut first`,
        409,
      );
    }

    // Mark old assignment as picked_up
    await (tx as any)
      .update(fnbServerAssignments)
      .set({
        status: 'picked_up',
        pickedUpBy: input.newServerUserId,
        pickedUpAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fnbServerAssignments.id, input.assignmentId));

    // Create a new active assignment for the picking-up server
    const [newAssignment] = await (tx as any)
      .insert(fnbServerAssignments)
      .values({
        tenantId: ctx.tenantId,
        locationId: assignment.locationId,
        sectionId: assignment.sectionId,
        serverUserId: input.newServerUserId,
        businessDate: assignment.businessDate,
        status: 'active',
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SECTION_PICKED_UP, {
      assignmentId: input.assignmentId,
      sectionId: assignment.sectionId,
      originalServerUserId: assignment.serverUserId,
      newServerUserId: input.newServerUserId,
      locationId: assignment.locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pickupSection', newAssignment);

    return { result: newAssignment!, events: [event] };
  });

  await auditLog(ctx, 'fnb.section.picked_up', 'fnb_server_assignments', result.id, undefined, {
    originalAssignmentId: input.assignmentId,
    newServerUserId: input.newServerUserId,
  });

  return result;
}
