import { eq, and, isNull } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroupCategories } from '../schema';
import type { CreateModifierGroupCategoryInput } from '../validation';

export async function createModifierGroupCategory(
  ctx: RequestContext,
  input: CreateModifierGroupCategoryInput,
) {
  const category = await publishWithOutbox(ctx, async (tx) => {
    // Validate parent exists and belongs to tenant (max depth 2)
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(catalogModifierGroupCategories)
        .where(
          and(
            eq(catalogModifierGroupCategories.id, input.parentId),
            eq(catalogModifierGroupCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!parent) {
        throw new NotFoundError('Modifier group category', input.parentId);
      }

      // Max depth 2: parent must be a root category (no parent itself)
      if (parent.parentId) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Modifier group categories cannot be nested more than 2 levels deep',
          422,
        );
      }
    }

    const [created] = await tx
      .insert(catalogModifierGroupCategories)
      .values({
        tenantId: ctx.tenantId,
        parentId: input.parentId ?? null,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'catalog.modifier_group_category.created.v1', {
      categoryId: created!.id,
      name: created!.name,
      parentId: created!.parentId,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.modifier_group_category.created',
    'catalog_modifier_group_category',
    category.id,
  );

  return category;
}
