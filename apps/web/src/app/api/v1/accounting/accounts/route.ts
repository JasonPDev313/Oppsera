import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listGlAccounts, createGlAccount, createGlAccountSchema } from '@oppsera/module-accounting';

// GET /api/v1/accounting/accounts — list GL accounts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const result = await listGlAccounts({
      tenantId: ctx.tenantId,
      accountType: url.searchParams.get('accountType') ?? undefined,
      classificationId: url.searchParams.get('classificationId') ?? undefined,
      isActive: url.searchParams.has('isActive')
        ? url.searchParams.get('isActive') === 'true'
        : undefined,
      isControlAccount: url.searchParams.has('isControlAccount')
        ? url.searchParams.get('isControlAccount') === 'true'
        : undefined,
      includeBalance: url.searchParams.get('includeBalance') === 'true',
      asOfDate: url.searchParams.get('asOfDate') ?? undefined,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/accounts — create GL account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGlAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const account = await createGlAccount(ctx, parsed.data);
    return NextResponse.json({ data: account }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
