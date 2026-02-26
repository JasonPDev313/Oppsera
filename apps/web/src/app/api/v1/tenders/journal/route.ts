import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getPaymentJournalEntries } from '@oppsera/module-payments';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/tenders/journal — get GL journal entries
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await getPaymentJournalEntries({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      businessDate: url.searchParams.get('businessDate') ?? undefined,
      orderId: url.searchParams.get('orderId') ?? undefined,
      postingStatus: url.searchParams.get('postingStatus') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.entries,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'payments', permission: 'accounting.view' },
);
