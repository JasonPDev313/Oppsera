import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { customerVisits } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CheckOutVisitInput } from '../validation';

export async function checkOutVisit(ctx: RequestContext, input: CheckOutVisitInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find the visit
    const [visit] = await (tx as any).select().from(customerVisits)
      .where(and(eq(customerVisits.id, input.visitId), eq(customerVisits.tenantId, ctx.tenantId)))
      .limit(1);
    if (!visit) throw new NotFoundError('Visit', input.visitId);

    // Ensure not already checked out
    if (visit.checkOutAt) throw new ValidationError('Visit is already checked out');

    // Compute duration
    const durationMinutes = Math.round((Date.now() - new Date(visit.checkInAt).getTime()) / 60000);

    const [updated] = await (tx as any).update(customerVisits).set({
      checkOutAt: new Date(),
      durationMinutes,
    }).where(eq(customerVisits.id, input.visitId)).returning();

    const event = buildEventFromContext(ctx, 'customer_visit.checked_out.v1', {
      visitId: input.visitId,
      customerId: visit.customerId,
      durationMinutes,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.visit_checked_out', 'customer_visit', input.visitId);
  return result;
}
