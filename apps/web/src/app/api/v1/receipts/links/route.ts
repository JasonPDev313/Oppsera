import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptLinksForOrder } from '@oppsera/core/settings/receipt-links';

// GET /api/v1/receipts/links?orderId=xxx — list receipt links for an order
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'orderId query parameter is required' } },
        { status: 400 },
      );
    }

    const links = await getReceiptLinksForOrder(ctx.tenantId, orderId);

    return NextResponse.json({
      data: links.map((link) => ({
        id: link.id,
        orderId: link.orderId,
        token: link.token,
        lookupCode: link.lookupCode,
        variant: link.variant,
        viewCount: link.viewCount,
        firstViewedAt: link.firstViewedAt,
        lastViewedAt: link.lastViewedAt,
        expiresAt: link.expiresAt,
        isActive: link.isActive,
        createdAt: link.createdAt,
      })),
    });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
