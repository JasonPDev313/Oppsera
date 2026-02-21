import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { allocateLandedCost } from '@oppsera/module-ap';

function extractBillId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const billId = extractBillId(request);
    const body = await request.json();
    const result = await allocateLandedCost(ctx, {
      billId,
      postAdjustingEntry: body.postAdjustingEntry ?? false,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' },
);
