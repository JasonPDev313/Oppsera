import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { applyVendorCredit } from '@oppsera/module-ap';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    if (!body.creditBillId || !body.targetBillId || !body.amount) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'creditBillId, targetBillId, and amount are required' } },
        { status: 400 },
      );
    }
    const result = await applyVendorCredit(ctx, body);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
