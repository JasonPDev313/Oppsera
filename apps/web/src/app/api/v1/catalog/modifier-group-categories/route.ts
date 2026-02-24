import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createModifierGroupCategory,
  createModifierGroupCategorySchema,
  listModifierGroupCategories,
} from '@oppsera/module-catalog';

// GET /api/v1/catalog/modifier-group-categories — list all categories (flat)
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const categories = await listModifierGroupCategories(ctx.tenantId);
    return NextResponse.json({ data: categories });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=300, stale-while-revalidate=600' },
);

// POST /api/v1/catalog/modifier-group-categories — create category
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createModifierGroupCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const category = await createModifierGroupCategory(ctx, parsed.data);
    return NextResponse.json({ data: category }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
