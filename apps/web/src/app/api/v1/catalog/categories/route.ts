import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createCategory,
  createCategorySchema,
  listCategories,
} from '@oppsera/module-catalog';

// GET /api/v1/catalog/categories — list categories with item counts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const categories = await listCategories(ctx.tenantId, includeInactive);
    return NextResponse.json({ data: categories });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=60, stale-while-revalidate=300' },
);

// POST /api/v1/catalog/categories — create category
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const category = await createCategory(ctx, parsed.data);
    return NextResponse.json({ data: category }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
