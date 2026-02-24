import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { tags } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { UpdateTagInput } from '../validation';

export async function updateTag(ctx: RequestContext, tagId: string, input: UpdateTagInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.tenantId, ctx.tenantId), isNull(tags.archivedAt)))
      .limit(1);
    if (!existing) throw new NotFoundError('Tag', tagId);
    if (existing.isSystem) throw new AppError('SYSTEM_TAG', 'Cannot modify a system tag', 403);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.color !== undefined) updates.color = input.color;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.category !== undefined) updates.category = input.category;
    if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const [updated] = await (tx as any).update(tags).set(updates)
      .where(eq(tags.id, tagId)).returning();

    const event = buildEventFromContext(ctx, 'customer.tag_definition.updated.v1', {
      tagId,
      changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_updated', 'tag', tagId);
  return result;
}
