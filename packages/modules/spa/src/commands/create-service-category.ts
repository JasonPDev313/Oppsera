import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServiceCategories } from '@oppsera/db';
import { createServiceCategorySchema } from '../validation';
import type { CreateServiceCategoryInput } from '../validation';

export async function createServiceCategory(ctx: RequestContext, input: CreateServiceCategoryInput) {
  const parsed = createServiceCategorySchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate parent category exists if provided
    if (parsed.parentId) {
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

    // Validate unique name within tenant
    const [existing] = await tx
      .select({ id: spaServiceCategories.id })
      .from(spaServiceCategories)
      .where(
        and(
          eq(spaServiceCategories.tenantId, ctx.tenantId),
          eq(spaServiceCategories.name, parsed.name),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError('VALIDATION_ERROR', `Service category "${parsed.name}" already exists`, 400);
    }

    const [created] = await tx
      .insert(spaServiceCategories)
      .values({
        tenantId: ctx.tenantId,
        name: parsed.name,
        parentId: parsed.parentId ?? null,
        description: parsed.description ?? null,
        icon: parsed.icon ?? null,
        sortOrder: parsed.sortOrder,
      })
      .returning();

    // Categories are config — no domain events emitted
    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.service_category.created', 'spa_service_category', result.id);

  return result;
}
