import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { reconcileCloseBatch } from '@oppsera/module-fnb';

// POST /api/v1/fnb/close-batch/[id]/reconcile — reconcile close batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    const result = await reconcileCloseBatch(ctx, body);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage' , writeAccess: true },
);
