import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCashManagementDashboard } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!locationId || !startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId, startDate, and endDate are required' } },
        { status: 400 },
      );
    }

    const result = await getCashManagementDashboard({
      tenantId: ctx.tenantId,
      locationId,
      startDate,
      endDate,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
