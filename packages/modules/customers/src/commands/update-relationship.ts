import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerRelationships } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateRelationshipInput } from '../validation';

export async function updateCustomerRelationship(ctx: RequestContext, input: UpdateRelationshipInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify relationship exists
    const [rel] = await (tx as any).select().from(customerRelationships)
      .where(and(eq(customerRelationships.id, input.relationshipId), eq(customerRelationships.tenantId, ctx.tenantId)))
      .limit(1);
    if (!rel) throw new NotFoundError('CustomerRelationship', input.relationshipId);

    const updates: Record<string, unknown> = {};
    if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;
    if (input.effectiveDate !== undefined) updates.effectiveDate = input.effectiveDate;
    if (input.expirationDate !== undefined) updates.expirationDate = input.expirationDate;
    if (input.notes !== undefined) updates.notes = input.notes;

    const [updated] = await (tx as any).update(customerRelationships).set(updates)
      .where(eq(customerRelationships.id, input.relationshipId)).returning();

    return updated!;
  });

  await auditLog(ctx, 'customer.relationship_updated', 'customer_relationship', input.relationshipId);
  return result;
}
