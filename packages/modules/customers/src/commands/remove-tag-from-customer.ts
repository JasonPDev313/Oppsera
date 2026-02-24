import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { tags, customerTags, tagAuditLog } from '@oppsera/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { RemoveTagFromCustomerInput } from '../validation';

export async function removeTagFromCustomer(
  ctx: RequestContext,
  customerId: string,
  tagId: string,
  input: RemoveTagFromCustomerInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find active assignment
    const [assignment] = await (tx as any).select().from(customerTags)
      .where(and(
        eq(customerTags.tenantId, ctx.tenantId),
        eq(customerTags.customerId, customerId),
        eq(customerTags.tagId, tagId),
        isNull(customerTags.removedAt),
      ))
      .limit(1);
    if (!assignment) throw new NotFoundError('Tag assignment', `${customerId}/${tagId}`);

    // Soft-remove
    const [updated] = await (tx as any).update(customerTags).set({
      removedAt: new Date(),
      removedBy: ctx.user.id,
      removedReason: input.reason ?? null,
    }).where(eq(customerTags.id, assignment.id)).returning();

    // Decrement tag customer_count
    await (tx as any).update(tags).set({
      customerCount: sql`customer_count - 1`,
      updatedAt: new Date(),
    }).where(eq(tags.id, tagId));

    // Insert audit log entry
    await (tx as any).insert(tagAuditLog).values({
      tenantId: ctx.tenantId,
      customerId,
      tagId,
      action: 'removed',
      source: 'manual',
      actorId: ctx.user.id,
      evidence: input.reason ? { reason: input.reason } : null,
    });

    const event = buildEventFromContext(ctx, 'customer.tag.removed.v1', {
      customerId,
      tagId,
      source: 'manual',
      reason: input.reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_removed', 'customer', customerId);
  return result;
}
