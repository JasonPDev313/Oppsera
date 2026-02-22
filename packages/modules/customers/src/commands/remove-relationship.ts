import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerRelationships, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveRelationshipInput } from '../validation';

export async function removeCustomerRelationship(ctx: RequestContext, input: RemoveRelationshipInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify relationship exists
    const [rel] = await (tx as any).select().from(customerRelationships)
      .where(and(eq(customerRelationships.id, input.relationshipId), eq(customerRelationships.tenantId, ctx.tenantId)))
      .limit(1);
    if (!rel) throw new NotFoundError('CustomerRelationship', input.relationshipId);

    // Delete the relationship
    await (tx as any).delete(customerRelationships)
      .where(eq(customerRelationships.id, input.relationshipId));

    // Activity log for the parent customer
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: rel.parentCustomerId,
      activityType: 'system',
      title: `Relationship removed: ${rel.relationshipType}`,
      metadata: {
        relationshipId: rel.id,
        relationshipType: rel.relationshipType,
        childCustomerId: rel.childCustomerId,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.relationship.removed.v1', {
      parentCustomerId: rel.parentCustomerId,
      childCustomerId: rel.childCustomerId,
      relationshipId: rel.id,
      relationshipType: rel.relationshipType,
    });

    return { result: { id: input.relationshipId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.relationship_removed', 'customer_relationship', input.relationshipId);
  return result;
}
