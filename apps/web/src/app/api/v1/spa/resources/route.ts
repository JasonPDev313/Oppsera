import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listResources,
  createResource,
  createResourceSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/resources — list spa resources with filters
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const locationId = searchParams.get('locationId') ?? undefined;
    const resourceType = searchParams.get('type') ?? undefined;
    const statusParam = searchParams.get('status');
    const search = searchParams.get('search') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    // Map status filter to isActive boolean
    let isActive: boolean | undefined;
    if (statusParam === 'active') isActive = true;
    else if (statusParam === 'inactive') isActive = false;

    const validTypes = ['room', 'equipment', 'bed', 'chair', 'other'] as const;
    const typedResourceType = resourceType && validTypes.includes(resourceType as any)
      ? (resourceType as (typeof validTypes)[number])
      : undefined;

    const result = await listResources({
      tenantId: ctx.tenantId,
      locationId,
      resourceType: typedResourceType,
      isActive,
      search,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.resources.view' },
);

// POST /api/v1/spa/resources — create a new spa resource
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createResourceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const resource = await createResource(ctx, parsed.data);
    return NextResponse.json({ data: resource }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.resources.manage', writeAccess: true },
);
