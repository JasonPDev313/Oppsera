import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, AppError } from '@oppsera/shared';
import { openOrder, openOrderSchema, listOrders } from '@oppsera/module-orders';

// GET /api/v1/orders — list orders (requires locationId)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const status = url.searchParams.get('status') ?? undefined;
    const businessDate = url.searchParams.get('businessDate') ?? undefined;

    const result = await listOrders({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      cursor,
      limit,
      status,
      businessDate,
    });

    return NextResponse.json({
      data: result.orders,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);

// POST /api/v1/orders — open a new order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = openOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const order = await openOrder(ctx, parsed.data);
    return NextResponse.json({ data: order }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.manage' },
);
