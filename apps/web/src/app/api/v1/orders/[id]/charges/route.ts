import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { addServiceCharge, addServiceChargeSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/charges — add service charge
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = addServiceChargeSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await addServiceCharge(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.manage' },
);
