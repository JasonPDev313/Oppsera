import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRetailCloseBatch } from '@oppsera/core/retail-close';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/retail-close/[id] — Get a single close batch
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const batch = await getRetailCloseBatch({ tenantId: ctx.tenantId, batchId: id });

    if (!batch) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Close batch not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: batch });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);
