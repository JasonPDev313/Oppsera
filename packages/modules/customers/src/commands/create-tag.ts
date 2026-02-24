import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ConflictError } from '@oppsera/shared';
import { tags } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { CreateTagInput } from '../validation';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function createTag(ctx: RequestContext, input: CreateTagInput) {
  const slug = input.slug ?? slugify(input.name);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check slug uniqueness
    const [existing] = await (tx as any).select({ id: tags.id }).from(tags)
      .where(and(eq(tags.tenantId, ctx.tenantId), eq(tags.slug, slug), isNull(tags.archivedAt)))
      .limit(1);
    if (existing) throw new ConflictError('A tag with this slug already exists');

    const [created] = await (tx as any).insert(tags).values({
      tenantId: ctx.tenantId,
      name: input.name,
      slug,
      description: input.description ?? null,
      color: input.color ?? '#6366f1',
      icon: input.icon ?? null,
      tagType: input.tagType ?? 'manual',
      category: input.category ?? null,
      displayOrder: input.displayOrder ?? 0,
      metadata: input.metadata ?? null,
      createdBy: ctx.user.id,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer.tag_definition.created.v1', {
      tagId: created!.id,
      name: input.name,
      slug,
      tagType: input.tagType ?? 'manual',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.tag_created', 'tag', result.id);
  return result;
}
