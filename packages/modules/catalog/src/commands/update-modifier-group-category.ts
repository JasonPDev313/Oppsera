import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogModifierGroupCategories } from '../schema';
import type { UpdateModifierGroupCategoryInput } from '../validation';

export async function updateModifierGroupCategory(
  ctx: RequestContext,
  categoryId: string,
  input: UpdateModifierGroupCategoryInput,
) {
  const { category, changes } = await publishWithOutbox(ctx, async (tx) => {
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

    // Validate parent if being changed
    if (input.parentId !== undefined) {
      if (input.parentId !== null) {
        if (input.parentId === categoryId) {
          throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent', 422);
        }
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
        if (parent.parentId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Modifier group categories cannot be nested more than 2 levels deep',
            422,
          );
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.parentId !== undefined) updates.parentId = input.parentId;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(catalogModifierGroupCategories)
      .set(updates)
      .where(eq(catalogModifierGroupCategories.id, categoryId))
      .returning();

    const detectedChanges = computeChanges(
      { name: existing.name, parentId: existing.parentId, sortOrder: existing.sortOrder },
      { name: updated!.name, parentId: updated!.parentId, sortOrder: updated!.sortOrder },
      [],
    );

    const event = buildEventFromContext(ctx, 'catalog.modifier_group_category.updated.v1', {
      categoryId,
      changes: detectedChanges ?? {},
    });

    return { result: { category: updated!, changes: detectedChanges }, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.modifier_group_category.updated',
    'catalog_modifier_group_category',
    categoryId,
    changes,
  );

  return category;
}
