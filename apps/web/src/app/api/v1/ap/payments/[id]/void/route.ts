import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidPayment } from '@oppsera/module-ap';

function extractPaymentId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentId = extractPaymentId(request);
    const body = await request.json();
    if (!body.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason is required' } },
        { status: 400 },
      );
    }
    const result = await voidPayment(ctx, paymentId, body.reason.trim());
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' },
);
