import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogCategories } from '../schema';
import type { CreateCategoryInput } from '../validation';

// Max 3 levels: Department (parentId=null) → SubDepartment → Category
const MAX_NESTING_DEPTH = 3;

export async function createCategory(
  ctx: RequestContext,
  input: CreateCategoryInput,
) {
  const category = await publishWithOutbox(ctx, async (tx) => {
    if (input.parentId) {
      const parent = await tx
        .select()
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.id, input.parentId),
            eq(catalogCategories.tenantId, ctx.tenantId),
            eq(catalogCategories.isActive, true),
          ),
        )
        .limit(1);

      if (parent.length === 0) {
        throw new NotFoundError('Category', input.parentId);
      }

      // Walk up the parent chain to check nesting depth
      // depth starts at 2: the parent (1) + the new child (2)
      let depth = 2;
      let currentParentId: string | null = parent[0]!.parentId;
      while (currentParentId) {
        depth++;
        if (depth > MAX_NESTING_DEPTH) {
          throw new ValidationError(
            `Maximum category nesting depth is ${MAX_NESTING_DEPTH} levels (Department → Sub-Department → Category)`,
            [{ field: 'parentId', message: `Cannot nest deeper than ${MAX_NESTING_DEPTH} levels` }],
          );
        }
        const [ancestor] = await tx
          .select({ parentId: catalogCategories.parentId })
          .from(catalogCategories)
          .where(
            and(
              eq(catalogCategories.id, currentParentId),
              eq(catalogCategories.tenantId, ctx.tenantId),
            ),
          )
          .limit(1);
        currentParentId = ancestor?.parentId ?? null;
      }
    }

    const [created] = await tx
      .insert(catalogCategories)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'catalog.category.created.v1', {
      categoryId: created!.id,
      name: created!.name,
      parentId: created!.parentId,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'catalog.category.created', 'catalog_category', category.id);

  return category;
}
