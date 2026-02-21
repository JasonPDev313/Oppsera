import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { lockCloseBatch } from '@oppsera/module-fnb';

// POST /api/v1/fnb/close-batch/[id]/lock — lock close batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const closeBatchId = parts[parts.length - 2]!;

    const result = await lockCloseBatch(ctx, { closeBatchId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage' },
);
