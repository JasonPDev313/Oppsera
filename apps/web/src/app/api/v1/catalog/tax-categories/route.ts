import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createTaxCategory,
  createTaxCategorySchema,
  listTaxCategories,
} from '@oppsera/module-catalog';

// GET /api/v1/catalog/tax-categories — list tax categories
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const taxCategories = await listTaxCategories(ctx.tenantId, includeInactive);
    return NextResponse.json({ data: taxCategories });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=300, stale-while-revalidate=600' },
);

// POST /api/v1/catalog/tax-categories — create tax category
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTaxCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const taxCategory = await createTaxCategory(ctx, parsed.data);
    return NextResponse.json({ data: taxCategory }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
