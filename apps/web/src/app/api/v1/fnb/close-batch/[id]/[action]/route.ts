import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  reconcileCloseBatch,
  postCloseBatch,
  lockCloseBatch,
} from '@oppsera/module-fnb';

const ACTIONS: Record<string, true> = { reconcile: true, post: true, lock: true };

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/close-batch/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }

    switch (action) {
      case 'reconcile': {
        const body = await request.json();
        const result = await reconcileCloseBatch(ctx, body);
        return NextResponse.json({ data: result });
      }
      case 'post': {
        const body = await request.json();
        const result = await postCloseBatch(ctx, body);
        return NextResponse.json({ data: result });
      }
      case 'lock': {
        const closeBatchId = extractId(request);
        const result = await lockCloseBatch(ctx, { closeBatchId });
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage', writeAccess: true },
);
