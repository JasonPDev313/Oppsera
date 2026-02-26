import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getStoredValueTransactions } from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractInstrumentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const svIdx = parts.indexOf('stored-value');
  return parts[svIdx + 1]!;
}

// GET /api/v1/customers/:id/stored-value/:instrumentId/transactions
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const instrumentId = extractInstrumentId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const data = await getStoredValueTransactions({
      tenantId: ctx.tenantId,
      instrumentId,
      cursor,
      limit,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.stored_value.view' },
);
