import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidReceipt } from '@oppsera/module-ar';

function extractReceiptId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/ar/receipts/:id/void — void a receipt
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const receiptId = extractReceiptId(request);
    const body = await request.json();
    if (!body.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason is required' } },
        { status: 400 },
      );
    }
    const result = await voidReceipt(ctx, { receiptId, reason: body.reason.trim() });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.manage' },
);
