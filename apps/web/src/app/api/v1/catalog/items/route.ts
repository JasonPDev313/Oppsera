import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createItem, createItemSchema, listItems } from '@oppsera/module-catalog';

// GET /api/v1/catalog/items — list items with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 5000) : 50;
    const categoryId = url.searchParams.get('categoryId') ?? undefined;
    const itemType = url.searchParams.get('itemType') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    const result = await listItems({
      tenantId: ctx.tenantId,
      cursor,
      limit,
      categoryId,
      itemType,
      search,
      includeArchived,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);

// POST /api/v1/catalog/items — create item
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await createItem(ctx, parsed.data);

    return NextResponse.json({ data: item }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
