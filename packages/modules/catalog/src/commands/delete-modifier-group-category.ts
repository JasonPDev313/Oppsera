import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroupCategories, catalogModifierGroups } from '../schema';

export async function deleteModifierGroupCategory(
  ctx: RequestContext,
  categoryId: string,
) {
  await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(catalogModifierGroupCategories)
      .where(
        and(
          eq(catalogModifierGroupCategories.id, categoryId),
          eq(catalogModifierGroupCategories.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Modifier group category', categoryId);
    }

    // Check for child categories
    const [child] = await tx
      .select({ id: catalogModifierGroupCategories.id })
      .from(catalogModifierGroupCategories)
      .where(
        and(
          eq(catalogModifierGroupCategories.parentId, categoryId),
          eq(catalogModifierGroupCategories.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (child) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Cannot delete a category that has child categories. Remove child categories first.',
        422,
      );
    }

    // Check for modifier groups referencing this category
    const [group] = await tx
      .select({ id: catalogModifierGroups.id })
      .from(catalogModifierGroups)
      .where(
        and(
          eq(catalogModifierGroups.categoryId, categoryId),
          eq(catalogModifierGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (group) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Cannot delete a category that has modifier groups assigned. Reassign groups first.',
        422,
      );
    }

    await tx
      .delete(catalogModifierGroupCategories)
      .where(eq(catalogModifierGroupCategories.id, categoryId));

    const event = buildEventFromContext(ctx, 'catalog.modifier_group_category.deleted.v1', {
      categoryId,
      name: existing.name,
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.modifier_group_category.deleted',
    'catalog_modifier_group_category',
    categoryId,
  );
}
