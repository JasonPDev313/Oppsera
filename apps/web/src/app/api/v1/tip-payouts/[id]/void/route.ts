import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidTipPayout } from '@oppsera/module-accounting';

function extractPayoutId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const payoutId = extractPayoutId(request);
    const body = await request.json();

    const result = await voidTipPayout(ctx, {
      payoutId,
      reason: body.reason || 'Voided by user',
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
