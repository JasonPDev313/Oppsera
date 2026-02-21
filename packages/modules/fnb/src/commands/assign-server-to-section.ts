import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbSections, fnbServerAssignments } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { AssignServerToSectionInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function assignServerToSection(
  ctx: RequestContext,
  input: AssignServerToSectionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'assignServerToSection',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate section exists
    const [section] = await (tx as any)
      .select()
      .from(fnbSections)
      .where(and(
        eq(fnbSections.id, input.sectionId),
        eq(fnbSections.tenantId, ctx.tenantId),
        eq(fnbSections.isActive, true),
      ))
      .limit(1);
    if (!section) throw new NotFoundError('Section', input.sectionId);

    const [created] = await (tx as any)
      .insert(fnbServerAssignments)
      .values({
        tenantId: ctx.tenantId,
        locationId: section.locationId,
        sectionId: input.sectionId,
        serverUserId: input.serverUserId,
        businessDate: input.businessDate,
        status: 'active',
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SERVER_ASSIGNED, {
      assignmentId: created!.id,
      sectionId: input.sectionId,
      serverUserId: input.serverUserId,
      locationId: section.locationId,
      businessDate: input.businessDate,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'assignServerToSection', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.server.assigned', 'fnb_server_assignments', result.id, undefined, {
    sectionId: input.sectionId,
    serverUserId: input.serverUserId,
  });

  return result;
}
