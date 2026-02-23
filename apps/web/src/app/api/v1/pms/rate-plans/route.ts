import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listRatePlans,
  createRatePlan,
  createRatePlanSchema,
} from '@oppsera/module-pms';

// GET /api/v1/pms/rate-plans — list rate plans (requires ?propertyId=)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'propertyId query parameter is required' },
      ]);
    }

    const limitParam = url.searchParams.get('limit');

    const result = await listRatePlans({
      tenantId: ctx.tenantId,
      propertyId,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: 'pms.rates.view' },
);

// POST /api/v1/pms/rate-plans — create rate plan
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRatePlanSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createRatePlan(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.rates.manage' , writeAccess: true },
);
