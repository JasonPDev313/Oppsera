import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { deactivateReceiptLink } from '@oppsera/core/settings/receipt-links';

// PATCH /api/v1/receipts/links/:id — deactivate a receipt link
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const linkId = segments[segments.length - 1]!;

    const body = await request.json();

    if (body.isActive === false) {
      await deactivateReceiptLink(ctx.tenantId, linkId);
      return NextResponse.json({ data: { id: linkId, isActive: false } });
    }

    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Only deactivation (isActive: false) is supported' } },
      { status: 400 },
    );
  },
  { entitlement: 'orders', permission: 'orders.manage' },
);
