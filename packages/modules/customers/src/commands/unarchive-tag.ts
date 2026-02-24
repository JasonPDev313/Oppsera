import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { tags } from '@oppsera/db';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

export async function unarchiveTag(ctx: RequestContext, tagId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.tenantId, ctx.tenantId), isNotNull(tags.archivedAt)))
      .limit(1);
    if (!existing) throw new NotFoundError('Tag', tagId);

    // Check slug uniqueness among active tags
    const [slugConflict] = await (tx as any).select({ id: tags.id }).from(tags)
      .where(and(
        eq(tags.tenantId, ctx.tenantId),
        eq(tags.slug, existing.slug),
        isNull(tags.archivedAt),
      ))
      .limit(1);
    if (slugConflict) throw new ConflictError('An active tag with this slug already exists');

    const [unarchived] = await (tx as any).update(tags).set({
      archivedAt: null,
      archivedBy: null,
      archivedReason: null,
      isActive: true,
      updatedAt: new Date(),
    }).where(eq(tags.id, tagId)).returning();

    const event = buildEventFromContext(ctx, 'customer.tag_definition.unarchived.v1', {
      tagId,
      slug: existing.slug,
    });

    return { result: unarchived!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_unarchived', 'tag', tagId);
  return result;
}
