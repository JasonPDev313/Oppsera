import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
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
    try { body = await request.json(); } catch { /* empty body — generate clientRequestId */ }

    // If body is empty/unparseable, supply a generated clientRequestId (POS convenience)
    const input = (body && typeof body === 'object' && Object.keys(body as Record<string, unknown>).length > 0)
      ? body
      : { clientRequestId: crypto.randomUUID() };

    const parsed = placeOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await placeOrder(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
