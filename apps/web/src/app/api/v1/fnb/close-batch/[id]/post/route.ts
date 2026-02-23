import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postCloseBatch } from '@oppsera/module-fnb';

// POST /api/v1/fnb/close-batch/[id]/post — post close batch to GL
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    const result = await postCloseBatch(ctx, body);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage' , writeAccess: true },
);
