import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { bootstrapTenantAccounting } from '@oppsera/module-accounting';

// POST /api/v1/accounting/bootstrap — bootstrap chart of accounts from template
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body uses default template */ }
    const result = await bootstrapTenantAccounting(ctx, {
      templateKey: body.templateKey as string | undefined,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
