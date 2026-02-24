import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { tags, customerTags, customers, tagAuditLog } from '@oppsera/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { ApplyTagToCustomerInput } from '../validation';

export async function applyTagToCustomer(
  ctx: RequestContext,
  customerId: string,
  input: ApplyTagToCustomerInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify tag exists and is active
    const [tag] = await (tx as any).select().from(tags)
      .where(and(eq(tags.id, input.tagId), eq(tags.tenantId, ctx.tenantId), isNull(tags.archivedAt)))
      .limit(1);
    if (!tag) throw new NotFoundError('Tag', input.tagId);

    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', customerId);

    // Check no active assignment exists
    const [existing] = await (tx as any).select({ id: customerTags.id }).from(customerTags)
      .where(and(
        eq(customerTags.tenantId, ctx.tenantId),
        eq(customerTags.customerId, customerId),
        eq(customerTags.tagId, input.tagId),
        isNull(customerTags.removedAt),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Customer already has this tag');

    // Insert assignment
    const [created] = await (tx as any).insert(customerTags).values({
      tenantId: ctx.tenantId,
      customerId,
      tagId: input.tagId,
      source: 'manual',
      appliedBy: ctx.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning();

    // Increment tag customer_count
    await (tx as any).update(tags).set({
      customerCount: sql`${tags.customerCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(tags.id, input.tagId));

    // Insert audit log entry
    await (tx as any).insert(tagAuditLog).values({
      tenantId: ctx.tenantId,
      customerId,
      tagId: input.tagId,
      action: 'applied',
      source: 'manual',
      actorId: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.tag.applied.v1', {
      customerId,
      tagId: input.tagId,
      tagName: tag.name,
      tagSlug: tag.slug,
      source: 'manual',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_applied', 'customer', customerId);
  return result;
}
