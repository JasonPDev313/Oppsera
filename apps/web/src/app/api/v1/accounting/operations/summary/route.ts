import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOperationsSummary } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const locationId = url.searchParams.get('locationId') || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    const result = await getOperationsSummary({
      tenantId: ctx.tenantId,
      startDate,
      endDate,
      locationId,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
