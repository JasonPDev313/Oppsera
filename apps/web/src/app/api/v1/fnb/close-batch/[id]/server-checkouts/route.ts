import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listServerCheckouts,
  beginServerCheckout,
  listServerCheckoutsSchema,
  beginServerCheckoutSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/close-batch/[id]/server-checkouts — list server checkouts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const closeBatchId = parts[parts.length - 2]!;
    const url = request.nextUrl;

    const parsed = listServerCheckoutsSchema.safeParse({
      tenantId: ctx.tenantId,
      closeBatchId,
      status: url.searchParams.get('status') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listServerCheckouts(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.view' },
);

// POST /api/v1/fnb/close-batch/[id]/server-checkouts — begin server checkout
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = beginServerCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await beginServerCheckout(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.manage' , writeAccess: true },
);
