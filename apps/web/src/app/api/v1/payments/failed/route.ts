import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listFailedPayments, getFailedPaymentCounts } from '@oppsera/module-payments';

/**
 * GET /api/v1/payments/failed
 * List failed payment intents (declined/error) with filters.
 * ?counts=true returns just the count summary.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    // Quick path for count-only requests (e.g., dashboard badge)
    if (url.searchParams.get('counts') === 'true') {
      const counts = await getFailedPaymentCounts(ctx.tenantId);
      return NextResponse.json({ data: counts });
    }

    const result = await listFailedPayments(ctx.tenantId, {
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      customerId: url.searchParams.get('customerId') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'payments', permission: 'payments.transactions.view' },
);
