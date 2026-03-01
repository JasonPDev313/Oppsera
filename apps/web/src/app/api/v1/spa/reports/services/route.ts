import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getServiceAnalytics } from '@oppsera/module-spa';

// GET /api/v1/spa/reports/services — service analytics
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limitParam = searchParams.get('limit');
    const sortBy = searchParams.get('sortBy') as 'revenue' | 'bookings' | 'completions' | 'name' | null;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    try {
      const result = await getServiceAnalytics({
        tenantId: ctx.tenantId,
        startDate,
        endDate,
        limit: limitParam ? parseInt(limitParam, 10) : undefined,
        sortBy: sortBy ?? undefined,
      });

      return NextResponse.json({ data: result.items });
    } catch (err) {
      console.error('[spa-reports] services error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load service analytics data' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'spa', permission: 'spa.reports.view' },
);
