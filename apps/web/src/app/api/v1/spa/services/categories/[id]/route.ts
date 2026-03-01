import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateServiceCategory,
  updateServiceCategorySchema,
} from '@oppsera/module-spa';

function extractCategoryId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/spa/services/categories/:id
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/spa/services/categories/:id — update service category
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);
    const body = await request.json();
    const parsed = updateServiceCategorySchema.safeParse({ ...body, id: categoryId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const category = await updateServiceCategory(ctx, parsed.data);
    return NextResponse.json({ data: category });
  },
  { entitlement: 'spa', permission: 'spa.services.manage', writeAccess: true },
);
