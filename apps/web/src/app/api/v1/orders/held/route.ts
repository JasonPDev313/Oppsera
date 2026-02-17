import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { listHeldOrders } from '@oppsera/module-orders';

// GET /api/v1/orders/held — list held (saved) orders
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;

    const result = await listHeldOrders({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      cursor,
      limit,
      employeeId,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({
      data: result.orders,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
