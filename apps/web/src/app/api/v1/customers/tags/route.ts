import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listTags,
  createTag,
  createTagSchema,
} from '@oppsera/module-customers';

// GET /api/v1/customers/tags
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await listTags({
      tenantId: ctx.tenantId,
      tagType: (searchParams.get('tagType') as 'manual' | 'smart') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      isActive: searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined,
      includeArchived: searchParams.get('includeArchived') === 'true',
      search: searchParams.get('search') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);

// POST /api/v1/customers/tags
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const tag = await createTag(ctx, parsed.data);
    return NextResponse.json({ data: tag }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
