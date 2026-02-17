import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerVisits, customerActivityLog } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { RecordVisitInput } from '../validation';

export async function recordVisit(ctx: RequestContext, input: RecordVisitInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const now = new Date();

    // Insert visit record
    const [created] = await (tx as any).insert(customerVisits).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      location: input.location ?? null,
      checkInAt: now,
      checkInMethod: input.checkInMethod ?? 'manual',
      staffId: input.staffId ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
    }).returning();

    // Update customer visit stats
    const customerUpdates: Record<string, unknown> = {
      totalVisits: sql`${customers.totalVisits} + 1`,
      lastVisitAt: now,
      updatedAt: now,
    };
    if (input.staffId) {
      customerUpdates.lastStaffInteractionId = input.staffId;
    }
    await (tx as any).update(customers).set(customerUpdates)
      .where(eq(customers.id, input.customerId));

    // Activity log
    const title = input.location ? `Checked in at ${input.location}` : 'Checked in';
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title,
      metadata: { visitId: created!.id, location: input.location ?? null, checkInMethod: input.checkInMethod ?? 'manual' },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_visit.recorded.v1', {
      visitId: created!.id,
      customerId: input.customerId,
      location: input.location ?? null,
      checkInMethod: input.checkInMethod ?? 'manual',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.visit_recorded', 'customer', input.customerId);
  return result;
}
