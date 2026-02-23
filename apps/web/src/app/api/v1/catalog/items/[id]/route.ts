import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getItem, updateItem, updateItemSchema } from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id
  return parts[parts.length - 1]!;
}

// GET /api/v1/catalog/items/:id — item detail with modifiers, prices
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const item = await getItem(ctx.tenantId, itemId);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);

// PATCH /api/v1/catalog/items/:id — partial update
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const body = await request.json();
    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await updateItem(ctx, itemId, parsed.data);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
