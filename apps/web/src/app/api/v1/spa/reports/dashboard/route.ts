import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSpaReportingDashboard } from '@oppsera/module-spa';

// GET /api/v1/spa/reports/dashboard — spa dashboard KPI metrics for a date range
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
      const data = await getSpaReportingDashboard({
        tenantId: ctx.tenantId,
        locationId,
        startDate,
        endDate,
      });

      return NextResponse.json({ data });
    } catch (err) {
      console.error('[spa-reports] dashboard error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load spa dashboard metrics' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'spa', permission: 'spa.reports.view' },
);
