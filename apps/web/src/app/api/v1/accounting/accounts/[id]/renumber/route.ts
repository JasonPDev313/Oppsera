import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { renumberGlAccount, renumberGlAccountSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/accounts/:id/renumber — change account number
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.nextUrl.pathname.split('/').at(-2)!;
    const body = await request.json();
    const input = renumberGlAccountSchema.parse(body);
    const result = await renumberGlAccount(ctx, accountId, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
