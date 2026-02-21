import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postPayment } from '@oppsera/module-ap';

function extractPaymentId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentId = extractPaymentId(request);
    const result = await postPayment(ctx, paymentId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' },
);
