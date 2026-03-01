import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listProviders,
  createProvider,
  createProviderSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/providers — list providers with optional filters
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? undefined;
    const serviceId = url.searchParams.get('serviceId') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const isActiveParam = url.searchParams.get('isActive');
    const limitParam = url.searchParams.get('limit');

    const isActive =
      isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const result = await listProviders({
      tenantId: ctx.tenantId,
      locationId,
      serviceId,
      isActive,
      search,
      cursor,
      limit,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'spa', permission: 'spa.providers.view' },
);

// POST /api/v1/spa/providers — create a new provider
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createProviderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const provider = await createProvider(ctx, parsed.data);
    return NextResponse.json({ data: provider }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);
