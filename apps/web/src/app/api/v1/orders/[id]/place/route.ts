import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { placeOrder, placeOrderSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/place — place order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    let body: unknown = {};
    try { body = await request.json(); } catch { /* empty body is valid for place */ }
    const parsed = placeOrderSchema.safeParse(body);

    const result = await placeOrder(ctx, orderId, parsed.success ? parsed.data : { clientRequestId: crypto.randomUUID() });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
