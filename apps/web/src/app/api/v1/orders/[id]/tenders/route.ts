import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { orders, withTenant } from '@oppsera/db';
import { recordTender, recordTenderSchema, getTendersByOrder } from '@oppsera/module-payments';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/orders/{id}/tenders → id is at parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/tenders — record a tender payment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = recordTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await recordTender(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.create' , writeAccess: true },
);

// GET /api/v1/orders/:id/tenders — get tenders for an order
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const order = await withTenant(ctx.tenantId, async (tx) => {
      const [row] = await tx.select({ total: orders.total }).from(orders)
        .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.id, orderId)));
      return row;
    });
    if (!order) {
      throw new NotFoundError('Order');
    }
    const result = await getTendersByOrder(ctx.tenantId, orderId, order.total);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.view' },
);
