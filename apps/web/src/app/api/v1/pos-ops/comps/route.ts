import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCompsByOrder } from '@oppsera/core/pos-ops';

// GET /api/v1/pos-ops/comps?orderId=xxx — Get comps for an order
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'orderId is required' } },
        { status: 400 },
      );
    }

    const comps = await getCompsByOrder({
      tenantId: ctx.tenantId,
      orderId,
    });

    return NextResponse.json({ data: comps });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);
