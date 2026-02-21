import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { bootstrapTenantAccounting } from '@oppsera/module-accounting';

// POST /api/v1/accounting/bootstrap — bootstrap chart of accounts from template
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const result = await bootstrapTenantAccounting(ctx, {
      templateKey: body.templateKey,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
