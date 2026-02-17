import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getOrderByNumber } from '@oppsera/module-orders';

// GET /api/v1/orders/by-number/:number — get order by number
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const parts = new URL(request.url).pathname.split('/');
    const orderNumber = parts[parts.length - 1]!;

    const order = await getOrderByNumber(ctx.tenantId, ctx.locationId, orderNumber);
    return NextResponse.json({ data: order });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
