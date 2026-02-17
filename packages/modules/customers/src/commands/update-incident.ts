import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerIncidents } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateIncidentInput } from '../validation';

export async function updateIncident(ctx: RequestContext, input: UpdateIncidentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find the incident
    const [incident] = await (tx as any).select().from(customerIncidents)
      .where(and(eq(customerIncidents.id, input.incidentId), eq(customerIncidents.tenantId, ctx.tenantId)))
      .limit(1);
    if (!incident) throw new NotFoundError('Incident', input.incidentId);

    const previousStatus = incident.status;

    // Build update object from provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) updates.status = input.status;
    if (input.resolution !== undefined) updates.resolution = input.resolution;
    if (input.compensationCents !== undefined) updates.compensationCents = input.compensationCents;
    if (input.compensationType !== undefined) updates.compensationType = input.compensationType;

    // If resolving or closing, set resolvedBy and resolvedAt
    if (input.status === 'resolved' || input.status === 'closed') {
      updates.resolvedBy = ctx.user.id;
      updates.resolvedAt = new Date();
    }

    const [updated] = await (tx as any).update(customerIncidents).set(updates)
      .where(eq(customerIncidents.id, input.incidentId)).returning();

    const event = buildEventFromContext(ctx, 'customer_incident.updated.v1', {
      incidentId: input.incidentId,
      customerId: incident.customerId,
      previousStatus,
      newStatus: input.status ?? previousStatus,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.incident_updated', 'customer_incident', input.incidentId);
  return result;
}
