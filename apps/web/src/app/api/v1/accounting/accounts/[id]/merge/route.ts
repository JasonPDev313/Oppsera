import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { mergeGlAccounts, mergeGlAccountsSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/accounts/:id/merge — merge source into target
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.nextUrl.pathname.split('/').at(-2)!;
    const body = await request.json();
    const input = mergeGlAccountsSchema.parse({
      sourceAccountId: accountId,
      targetAccountId: body.targetAccountId,
    });
    const result = await mergeGlAccounts(ctx, input);
    return NextResponse.json({ data: result }, { status: 200 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
