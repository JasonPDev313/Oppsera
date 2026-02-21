import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { createVendorCredit } from '@oppsera/module-ap';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    if (!body.vendorId || !body.creditNumber || !body.creditDate || !body.lines?.length) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'vendorId, creditNumber, creditDate, and lines are required' } },
        { status: 400 },
      );
    }
    const result = await createVendorCredit(ctx, body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ap', permission: 'ap.manage' },
);
