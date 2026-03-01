import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getClientInsights } from '@oppsera/module-spa';

// GET /api/v1/spa/reports/clients — client insights with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const customerId = searchParams.get('customerId') || undefined;
    const sortBy = searchParams.get('sortBy') as 'spend' | 'visits' | 'recency' | null;
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor') || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    try {
      const result = await getClientInsights({
        tenantId: ctx.tenantId,
        startDate,
        endDate,
        customerId,
        sortBy: sortBy ?? undefined,
        limit: limitParam ? parseInt(limitParam, 10) : undefined,
        cursor,
      });

      return NextResponse.json({
        data: result.items,
        meta: { cursor: result.cursor, hasMore: result.hasMore },
      });
    } catch (err) {
      console.error('[spa-reports] clients error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load client insights data' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'spa', permission: 'spa.reports.view' },
);
