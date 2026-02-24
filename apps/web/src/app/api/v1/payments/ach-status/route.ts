import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getAchStatusSummary,
  listAchPending,
  listAchReturns,
  getAchReturnDistribution,
  getAchSettlementByDate,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/payments/ach-status
 *
 * Returns ACH payment status dashboard data.
 * Query params:
 *   - view: 'summary' | 'pending' | 'returns' | 'distribution' | 'settlement' (default: summary)
 *   - dateFrom, dateTo: YYYY-MM-DD date range filters
 *   - locationId: optional location filter
 *   - cursor, limit: pagination for list views
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const view = url.searchParams.get('view') ?? 'summary';
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;
    const locationId = url.searchParams.get('locationId') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;

    const baseInput = { tenantId: ctx.tenantId, dateFrom, dateTo, locationId };

    switch (view) {
      case 'summary': {
        const summary = await getAchStatusSummary(baseInput);
        return NextResponse.json({ data: summary });
      }

      case 'pending': {
        const pending = await listAchPending({ ...baseInput, cursor, limit });
        return NextResponse.json({ data: pending.items, meta: { cursor: pending.cursor, hasMore: pending.hasMore } });
      }

      case 'returns': {
        const returns = await listAchReturns({ ...baseInput, cursor, limit });
        return NextResponse.json({ data: returns.items, meta: { cursor: returns.cursor, hasMore: returns.hasMore } });
      }

      case 'distribution': {
        const dist = await getAchReturnDistribution(baseInput);
        return NextResponse.json({ data: dist });
      }

      case 'settlement': {
        const settlement = await getAchSettlementByDate(baseInput);
        return NextResponse.json({ data: settlement });
      }

      default:
        return NextResponse.json(
          { error: { code: 'INVALID_VIEW', message: `Invalid view: ${view}` } },
          { status: 400 },
        );
    }
  },
  { entitlement: 'payments', permission: 'payments.settings.manage' },
);
