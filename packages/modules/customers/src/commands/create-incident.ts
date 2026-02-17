import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerIncidents, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateIncidentInput } from '../validation';

export async function createIncident(ctx: RequestContext, input: CreateIncidentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Create incident
    const [created] = await (tx as any).insert(customerIncidents).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      incidentType: input.incidentType,
      severity: input.severity ?? 'medium',
      subject: input.subject,
      description: input.description ?? null,
      compensationCents: input.compensationCents ?? null,
      compensationType: input.compensationType ?? null,
      staffInvolvedIds: input.staffInvolvedIds ?? [],
      relatedOrderId: input.relatedOrderId ?? null,
      relatedVisitId: input.relatedVisitId ?? null,
      reportedBy: ctx.user.id,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Incident reported: ${input.subject}`,
      metadata: { incidentId: created!.id, incidentType: input.incidentType, severity: input.severity ?? 'medium' },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_incident.created.v1', {
      incidentId: created!.id,
      customerId: input.customerId,
      incidentType: input.incidentType,
      severity: input.severity ?? 'medium',
      subject: input.subject,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.incident_created', 'customer', input.customerId);
  return result;
}
