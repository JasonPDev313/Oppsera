import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { setServiceChargeExempt, setServiceChargeExemptSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/orders/:id/service-charge-exempt → id is at index -2
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/service-charge-exempt — toggle service charge exemption
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = setServiceChargeExemptSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setServiceChargeExempt(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage', writeAccess: true },
);
