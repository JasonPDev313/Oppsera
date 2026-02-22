import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getUnifiedLedger } from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/ledger — unified ledger with filtering
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);

    const accountId = url.searchParams.get('accountId') ?? undefined;
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const sourceModule = url.searchParams.get('sourceModule') ?? undefined;
    const locationId = url.searchParams.get('locationId') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit')
      ? Number(url.searchParams.get('limit'))
      : undefined;

    const data = await getUnifiedLedger({
      tenantId: ctx.tenantId,
      customerId,
      accountId,
      dateFrom,
      dateTo,
      type,
      status,
      sourceModule,
      locationId,
      cursor,
      limit,
    });
    return NextResponse.json({ data: data.items, meta: { cursor: data.cursor, hasMore: data.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.financial.view' },
);
