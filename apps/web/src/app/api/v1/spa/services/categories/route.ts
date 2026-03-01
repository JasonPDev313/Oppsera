import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listServiceCategories,
  createServiceCategory,
  createServiceCategorySchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/services/categories — list all service categories
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const categories = await listServiceCategories(
      ctx.tenantId,
      ctx.locationId ?? undefined,
    );

    return NextResponse.json({ data: categories });
  },
  { entitlement: 'spa', permission: 'spa.services.view' },
);

// POST /api/v1/spa/services/categories — create a new service category
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createServiceCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const category = await createServiceCategory(ctx, parsed.data);
    return NextResponse.json({ data: category }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.services.manage', writeAccess: true },
);
