import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runMonthlyDepreciation } from '@oppsera/module-accounting';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { periodDate } = body;

    if (!periodDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'periodDate is required' } },
        { status: 400 },
      );
    }

    const result = await runMonthlyDepreciation(ctx, { periodDate });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
