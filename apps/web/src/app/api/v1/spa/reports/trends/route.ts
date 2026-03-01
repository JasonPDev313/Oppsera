import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSpaDailyTrends } from '@oppsera/module-spa';

// GET /api/v1/spa/reports/trends — daily trend data
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const locationId = searchParams.get('locationId') || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    try {
      const result = await getSpaDailyTrends({
        tenantId: ctx.tenantId,
        startDate,
        endDate,
        locationId,
      });

      return NextResponse.json({ data: result.items });
    } catch (err) {
      console.error('[spa-reports] trends error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load daily trend data' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'spa', permission: 'spa.reports.view' },
);
