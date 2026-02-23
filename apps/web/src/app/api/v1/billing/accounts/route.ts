import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createBillingAccount,
  createBillingAccountSchema,
  listBillingAccounts,
} from '@oppsera/module-customers';

// GET /api/v1/billing/accounts — list billing accounts with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const status = url.searchParams.get('status') ?? undefined;

    const result = await listBillingAccounts({
      tenantId: ctx.tenantId,
      cursor,
      limit,
      status,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'billing.view' },
);

// POST /api/v1/billing/accounts — create billing account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createBillingAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const account = await createBillingAccount(ctx, parsed.data);

    return NextResponse.json({ data: account }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'billing.manage' , writeAccess: true },
);
