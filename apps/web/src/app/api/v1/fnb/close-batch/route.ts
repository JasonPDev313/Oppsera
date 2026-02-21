import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { startCloseBatch } from '@oppsera/module-fnb';

// POST /api/v1/fnb/close-batch — start a close batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    const result = await startCloseBatch(ctx, body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage' },
);
