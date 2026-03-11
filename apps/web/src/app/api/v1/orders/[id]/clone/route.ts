import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { cloneOrder, cloneOrderSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/clone — clone an order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = cloneOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await cloneOrder(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
