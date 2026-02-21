import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerLedger } from '@oppsera/module-ar';

function extractCustomerId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/ar/reports/customer-ledger/:customerId — customer ledger
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const { searchParams } = new URL(request.url);
    const result = await getCustomerLedger({
      tenantId: ctx.tenantId,
      customerId,
      fromDate: searchParams.get('fromDate') ?? undefined,
      toDate: searchParams.get('toDate') ?? undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.view' },
);
