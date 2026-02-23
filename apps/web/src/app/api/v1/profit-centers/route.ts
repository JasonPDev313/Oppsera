import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listProfitCenters,
  createProfitCenter,
  createProfitCenterSchema,
} from '@oppsera/core/profit-centers';

// GET /api/v1/profit-centers?locationId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId') ?? undefined;

    const result = await listProfitCenters({
      tenantId: ctx.tenantId,
      locationId,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// POST /api/v1/profit-centers
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createProfitCenterSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createProfitCenter(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'settings.update' , writeAccess: true },
);
