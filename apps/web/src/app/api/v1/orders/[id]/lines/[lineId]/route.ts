import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeLineItem } from '@oppsera/module-orders';

function extractIds(request: NextRequest): { orderId: string; lineId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/orders/:id/lines/:lineId
  return { orderId: parts[parts.length - 3]!, lineId: parts[parts.length - 1]! };
}

// DELETE /api/v1/orders/:id/lines/:lineId — remove line item
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { orderId, lineId } = extractIds(request);
    const result = await removeLineItem(ctx, orderId, { clientRequestId: crypto.randomUUID(), lineItemId: lineId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
