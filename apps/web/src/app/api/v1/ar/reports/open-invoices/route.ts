import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOpenInvoices } from '@oppsera/module-ar';

// GET /api/v1/ar/reports/open-invoices — open invoices report
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getOpenInvoices({
      tenantId: ctx.tenantId,
      customerId: searchParams.get('customerId') ?? undefined,
      overdue: searchParams.get('overdue') === 'true' ? true : undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'ar', permission: 'ar.view' },
);
