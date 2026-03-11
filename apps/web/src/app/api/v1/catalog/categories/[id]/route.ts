import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
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

// GET /api/v1/catalog/categories/:id — get category with ancestry (parent chain)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx.execute(
        sql`SELECT
              c0.id, c0.name, c0.parent_id,
              c1.id AS parent_id_l1, c1.name AS parent_name_l1, c1.parent_id AS grandparent_id,
              c2.id AS parent_id_l2, c2.name AS parent_name_l2
            FROM catalog_categories c0
            LEFT JOIN catalog_categories c1 ON c1.id = c0.parent_id AND c1.tenant_id = c0.tenant_id
            LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id AND c2.tenant_id = c1.tenant_id
            WHERE c0.tenant_id = ${ctx.tenantId} AND c0.id = ${categoryId}
            LIMIT 1`,
      );
    });

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      throw new NotFoundError('Category', categoryId);
    }

    const r = arr[0]!;
    // Determine the 3-level hierarchy: department → sub-department → category
    // The depth depends on the number of non-null parents
    let departmentId: string | null = null;
    let departmentName: string | null = null;
    let subDepartmentId: string | null = null;
    let subDepartmentName: string | null = null;

    if (r.parent_id_l2) {
      // 3-level deep: grandparent=dept, parent=sub-dept, self=category
      departmentId = r.parent_id_l2 as string;
      departmentName = r.parent_name_l2 as string;
      subDepartmentId = r.parent_id_l1 as string;
      subDepartmentName = r.parent_name_l1 as string;
    } else if (r.parent_id_l1) {
      // 2-level deep: parent=dept, self=sub-dept or category
      departmentId = r.parent_id_l1 as string;
      departmentName = r.parent_name_l1 as string;
    }

    return NextResponse.json({
      data: {
        id: r.id as string,
        name: r.name as string,
        parentId: (r.parent_id as string) ?? null,
        ancestry: {
          departmentId,
          departmentName,
          subDepartmentId,
          subDepartmentName,
        },
      },
    });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);

// PATCH /api/v1/catalog/categories/:id — update category
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
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
        .where(and(eq(catalogCategories.id, categoryId), eq(catalogCategories.tenantId, ctx.tenantId)))
        .returning();

      return result!;
    });

    await auditLog(ctx, 'catalog.category.updated', 'catalog_category', categoryId);

    return NextResponse.json({ data: updated });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
