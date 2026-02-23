import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOrder, updateOrder, updateOrderSchema, deleteOrder, deleteOrderSchema } from '@oppsera/module-orders';
import { ValidationError } from '@oppsera/shared';

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

// PATCH /api/v1/orders/:id — update order (customerId, notes)
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = updateOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await updateOrder(ctx, orderId, parsed.data);
    const order = await getOrder(ctx.tenantId, orderId);
    return NextResponse.json({ data: order });
  },
  { entitlement: 'orders', permission: 'orders.create' , writeAccess: true },
);

// DELETE /api/v1/orders/:id — soft delete order
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body is fine */ }
    const parsed = deleteOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await deleteOrder(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
