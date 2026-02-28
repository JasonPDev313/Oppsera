import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAgedTrialBalance } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('asOf');
    if (!asOfDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'asOf date is required' } },
        { status: 400 },
      );
    }

    const report = await getAgedTrialBalance({
      tenantId: ctx.tenantId,
      asOfDate,
      locationId: url.searchParams.get('locationId') ?? undefined,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
