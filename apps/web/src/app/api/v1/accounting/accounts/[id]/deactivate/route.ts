import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { updateGlAccount } from '@oppsera/module-accounting';

// POST /api/v1/accounting/accounts/:id/deactivate — deactivate account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.nextUrl.pathname.split('/').at(-2)!;
    const result = await updateGlAccount(ctx, accountId, { isActive: false });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
