import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptByLookup } from '@oppsera/core/settings/receipt-links';

// GET /api/v1/receipts/links/search?lookupCode=xxx — manager lookup tool
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const lookupCode = url.searchParams.get('lookupCode');

    if (!lookupCode) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'lookupCode query parameter is required' } },
        { status: 400 },
      );
    }

    const link = await getReceiptByLookup(ctx.tenantId, lookupCode);

    if (!link) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No active receipt link found for this code' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
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
      },
    });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
