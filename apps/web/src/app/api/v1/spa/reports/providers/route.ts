import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProviderPerformanceReport } from '@oppsera/module-spa';

// GET /api/v1/spa/reports/providers — provider performance metrics from CQRS read model
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const providerId = searchParams.get('providerId') || undefined;
    const limitParam = searchParams.get('limit');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    try {
      const result = await getProviderPerformanceReport({
        tenantId: ctx.tenantId,
        startDate,
        endDate,
        providerId,
        limit: limitParam ? parseInt(limitParam, 10) : undefined,
      });

      return NextResponse.json({ data: result.items });
    } catch (err) {
      console.error('[spa-reports] providers error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load provider performance data' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'spa', permission: 'spa.reports.view' },
);
