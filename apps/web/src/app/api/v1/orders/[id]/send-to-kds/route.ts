import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { orders } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { sendOrderLinesToKds } from '@oppsera/module-fnb';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/orders/:id/send-to-kds → id is 3 segments before end
  return parts[parts.length - 3]!;
}

// POST /api/v1/orders/:id/send-to-kds — send unsent food/bev items to KDS without placing
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);

    // Fetch order to validate status and get businessDate
    const [order] = await withTenant(ctx.tenantId, (tx) =>
      tx
        .select({
          id: orders.id,
          status: orders.status,
          businessDate: orders.businessDate,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)))
        .limit(1),
    );

    if (!order) {
      throw new AppError('NOT_FOUND', 'Order not found', 404);
    }

    if (order.status !== 'open') {
      throw new AppError('CONFLICT', `Order is ${order.status}, expected open`, 409);
    }

    const result = await sendOrderLinesToKds(ctx, orderId, order.businessDate);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage', writeAccess: true },
);
