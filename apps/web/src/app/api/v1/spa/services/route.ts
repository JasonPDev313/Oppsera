import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listServices,
  createService,
  createServiceSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/services — list services with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const categoryId = searchParams.get('categoryId') ?? undefined;
    const statusParam = searchParams.get('status') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    const validStatuses = ['active', 'archived', 'all'] as const;
    const status = statusParam && validStatuses.includes(statusParam as any)
      ? (statusParam as (typeof validStatuses)[number])
      : undefined;

    const result = await listServices({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? undefined,
      categoryId,
      status,
      search,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.services.view' },
);

// POST /api/v1/spa/services — create a new service
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createServiceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const service = await createService(ctx, parsed.data);
    return NextResponse.json({ data: service }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.services.manage', writeAccess: true },
);
