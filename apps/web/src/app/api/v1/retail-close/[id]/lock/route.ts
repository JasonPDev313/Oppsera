import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { lockRetailClose } from '@oppsera/core/retail-close';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/retail-close/[id]/lock — Lock the batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const batch = await lockRetailClose(ctx, { batchId: id });
    return NextResponse.json({ data: batch });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);
