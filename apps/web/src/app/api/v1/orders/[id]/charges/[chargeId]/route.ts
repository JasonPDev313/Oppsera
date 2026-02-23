import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeServiceCharge } from '@oppsera/module-orders';

function extractIds(request: NextRequest): { orderId: string; chargeId: string } {
  const parts = new URL(request.url).pathname.split('/');
  return { orderId: parts[parts.length - 3]!, chargeId: parts[parts.length - 1]! };
}

// DELETE /api/v1/orders/:id/charges/:chargeId — remove service charge
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { orderId, chargeId } = extractIds(request);
    const result = await removeServiceCharge(ctx, orderId, { clientRequestId: crypto.randomUUID(), chargeId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
