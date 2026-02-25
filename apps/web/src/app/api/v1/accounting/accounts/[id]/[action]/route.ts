import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  updateGlAccount,
  mergeGlAccounts,
  mergeGlAccountsSchema,
  renumberGlAccount,
  renumberGlAccountSchema,
} from '@oppsera/module-accounting';

const ACTIONS: Record<string, true> = {
  deactivate: true,
  reactivate: true,
  merge: true,
  renumber: true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/accounting/accounts/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const id = extractId(request);

    switch (action) {
      case 'deactivate': {
        const result = await updateGlAccount(ctx, id, { isActive: false });
        return NextResponse.json({ data: result });
      }
      case 'reactivate': {
        const result = await updateGlAccount(ctx, id, { isActive: true });
        return NextResponse.json({ data: result });
      }
      case 'merge': {
        const body = await request.json();
        const input = mergeGlAccountsSchema.parse({
          sourceAccountId: id,
          targetAccountId: body.targetAccountId,
        });
        const result = await mergeGlAccounts(ctx, input);
        return NextResponse.json({ data: result });
      }
      case 'renumber': {
        const body = await request.json();
        const input = renumberGlAccountSchema.parse(body);
        const result = await renumberGlAccount(ctx, id, input);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
