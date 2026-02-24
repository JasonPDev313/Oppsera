import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { tags, customerTags } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { ArchiveTagInput } from '../validation';

export async function archiveTag(ctx: RequestContext, tagId: string, input: ArchiveTagInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.tenantId, ctx.tenantId), isNull(tags.archivedAt)))
      .limit(1);
    if (!existing) throw new NotFoundError('Tag', tagId);
    if (existing.isSystem) throw new AppError('SYSTEM_TAG', 'Cannot archive a system tag', 403);

    // Archive the tag
    const [archived] = await (tx as any).update(tags).set({
      archivedAt: new Date(),
      archivedBy: ctx.user.id,
      archivedReason: input.reason ?? null,
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(tags.id, tagId)).returning();

    // Soft-remove all active customer assignments
    const now = new Date();
    await (tx as any).update(customerTags).set({
      removedAt: now,
      removedBy: ctx.user.id,
      removedReason: 'Tag archived',
    }).where(and(
      eq(customerTags.tenantId, ctx.tenantId),
      eq(customerTags.tagId, tagId),
      isNull(customerTags.removedAt),
    ));

    // Reset customer count
    await (tx as any).update(tags).set({ customerCount: 0 })
      .where(eq(tags.id, tagId));

    const event = buildEventFromContext(ctx, 'customer.tag_definition.archived.v1', {
      tagId,
      reason: input.reason,
    });

    return { result: archived!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_archived', 'tag', tagId);
  return result;
}
