import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOrder } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/orders/:id — order detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const order = await getOrder(ctx.tenantId, orderId);
    return NextResponse.json({ data: order });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
