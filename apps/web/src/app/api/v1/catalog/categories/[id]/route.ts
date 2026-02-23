import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { withTenant, catalogCategories } from '@oppsera/db';
import { updateCategorySchema } from '@oppsera/module-catalog';
import { auditLog } from '@oppsera/core/audit/helpers';

function extractCategoryId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/catalog/categories/:id — update category
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);
    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updated = await withTenant(ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.id, categoryId),
            eq(catalogCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Category', categoryId);
      }

      const [result] = await tx
        .update(catalogCategories)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(catalogCategories.id, categoryId))
        .returning();

      return result!;
    });

    await auditLog(ctx, 'catalog.category.updated', 'catalog_category', categoryId);

    return NextResponse.json({ data: updated });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
