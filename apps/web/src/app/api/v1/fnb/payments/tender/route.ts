import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { recordSplitTender } from '@oppsera/module-fnb';

// POST /api/v1/fnb/payments/tender — record a split tender
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    const result = await recordSplitTender(ctx, ctx.locationId ?? '', body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' },
);
