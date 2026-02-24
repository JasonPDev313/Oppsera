import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateModifierGroupCategory,
  updateModifierGroupCategorySchema,
  deleteModifierGroupCategory,
} from '@oppsera/module-catalog';

function extractCategoryId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/catalog/modifier-group-categories/:id — update category
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);
    const body = await request.json();
    const parsed = updateModifierGroupCategorySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const category = await updateModifierGroupCategory(ctx, categoryId, parsed.data);
    return NextResponse.json({ data: category });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);

// DELETE /api/v1/catalog/modifier-group-categories/:id — delete category
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const categoryId = extractCategoryId(request);
    await deleteModifierGroupCategory(ctx, categoryId);
    return NextResponse.json({ data: { deleted: true } });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
