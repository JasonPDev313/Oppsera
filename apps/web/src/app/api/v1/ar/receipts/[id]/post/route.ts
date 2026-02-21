import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postReceipt } from '@oppsera/module-ar';

function extractReceiptId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/ar/receipts/:id/post — post a receipt
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const receiptId = extractReceiptId(request);
    const result = await postReceipt(ctx, { receiptId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.manage' },
);
