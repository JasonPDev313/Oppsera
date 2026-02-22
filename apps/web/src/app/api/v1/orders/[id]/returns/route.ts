import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReturnsByOrder } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/orders/:id/returns — list return orders for an original
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const result = await getReturnsByOrder(ctx.tenantId, orderId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
