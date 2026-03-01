import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServiceCategories } from '@oppsera/db';
import { updateServiceCategorySchema } from '../validation';
import type { UpdateServiceCategoryInput } from '../validation';

export async function updateServiceCategory(ctx: RequestContext, input: UpdateServiceCategoryInput) {
  const parsed = updateServiceCategorySchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate category exists
    const [existing] = await tx
      .select()
      .from(spaServiceCategories)
      .where(
        and(
          eq(spaServiceCategories.id, parsed.id),
          eq(spaServiceCategories.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Service category not found: ${parsed.id}`, 404);
    }

    // Validate parent category exists if changed
    if (parsed.parentId !== undefined && parsed.parentId !== existing.parentId) {
      if (parsed.parentId) {
        // Prevent self-referencing
        if (parsed.parentId === parsed.id) {
          throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent', 400);
        }

        const [parent] = await tx
          .select({ id: spaServiceCategories.id })
          .from(spaServiceCategories)
          .where(
            and(
              eq(spaServiceCategories.id, parsed.parentId),
              eq(spaServiceCategories.tenantId, ctx.tenantId),
            ),
          )
          .limit(1);

        if (!parent) {
          throw new AppError('NOT_FOUND', `Parent category not found: ${parsed.parentId}`, 404);
        }
      }
    }

    // Validate name uniqueness if name changed
    if (parsed.name !== undefined && parsed.name !== existing.name) {
      const [duplicate] = await tx
        .select({ id: spaServiceCategories.id })
        .from(spaServiceCategories)
        .where(
          and(
            eq(spaServiceCategories.tenantId, ctx.tenantId),
            eq(spaServiceCategories.name, parsed.name),
          ),
        )
        .limit(1);

      if (duplicate && duplicate.id !== parsed.id) {
        throw new AppError('VALIDATION_ERROR', `Service category "${parsed.name}" already exists`, 400);
      }
    }

    // Build update set — only include fields that were provided
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.name !== undefined) updateSet.name = parsed.name;
    if (parsed.parentId !== undefined) updateSet.parentId = parsed.parentId ?? null;
    if (parsed.description !== undefined) updateSet.description = parsed.description ?? null;
    if (parsed.icon !== undefined) updateSet.icon = parsed.icon ?? null;
    if (parsed.sortOrder !== undefined) updateSet.sortOrder = parsed.sortOrder;

    const [updated] = await tx
      .update(spaServiceCategories)
      .set(updateSet)
      .where(eq(spaServiceCategories.id, parsed.id))
      .returning();

    // Categories are config — no domain events emitted
    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.service_category.updated', 'spa_service_category', result.id);

  return result;
}
