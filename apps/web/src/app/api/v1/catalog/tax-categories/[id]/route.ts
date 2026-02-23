import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { withTenant, taxCategories } from '@oppsera/db';
import { updateTaxCategorySchema } from '@oppsera/module-catalog';
import { auditLog } from '@oppsera/core/audit/helpers';

function extractTaxCategoryId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/catalog/tax-categories/:id — update tax category
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const taxCategoryId = extractTaxCategoryId(request);
    const body = await request.json();
    const parsed = updateTaxCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updated = await withTenant(ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(taxCategories)
        .where(
          and(
            eq(taxCategories.id, taxCategoryId),
            eq(taxCategories.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Tax category', taxCategoryId);
      }

      const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
      if (parsed.data.rate !== undefined) {
        updates.rate = String(parsed.data.rate);
      }

      const [result] = await tx
        .update(taxCategories)
        .set(updates)
        .where(eq(taxCategories.id, taxCategoryId))
        .returning();

      return result!;
    });

    await auditLog(ctx, 'catalog.tax_category.updated', 'tax_category', taxCategoryId);

    return NextResponse.json({ data: updated });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
