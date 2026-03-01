import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { approveCommissions, payCommissions } from '@oppsera/module-spa';

const ACTIONS: Record<string, true> = {
  approve: true,
  pay: true,
};

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/spa/commissions/:action — approve or pay commissions
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }

    const body = await request.json();

    switch (action) {
      case 'approve': {
        if (!Array.isArray(body.ids) || body.ids.length === 0) {
          throw new ValidationError('Validation failed', [
            { field: 'ids', message: 'ids must be a non-empty array' },
          ]);
        }
        const result = await approveCommissions(ctx, {
          ids: body.ids,
          payPeriod: body.payPeriod as string | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'pay': {
        if (!Array.isArray(body.ids) || body.ids.length === 0) {
          throw new ValidationError('Validation failed', [
            { field: 'ids', message: 'ids must be a non-empty array' },
          ]);
        }
        const result = await payCommissions(ctx, { ids: body.ids });
        return NextResponse.json({ data: result });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown action' } },
      { status: 404 },
    );
  },
  { entitlement: 'spa', permission: 'spa.commissions.manage', writeAccess: true },
);
