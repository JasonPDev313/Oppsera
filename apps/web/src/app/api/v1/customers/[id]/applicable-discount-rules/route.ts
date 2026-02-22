import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getApplicableDiscountRules } from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/applicable-discount-rules — rules applicable to this customer
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const membershipClassId = url.searchParams.get('membershipClassId') ?? undefined;
    const segmentIdsParam = url.searchParams.get('segmentIds');
    const segmentIds = segmentIdsParam ? segmentIdsParam.split(',') : undefined;
    const asOfDate = url.searchParams.get('asOfDate') ?? undefined;

    const data = await getApplicableDiscountRules({
      tenantId: ctx.tenantId,
      customerId,
      membershipClassId,
      segmentIds,
      asOfDate,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.discount_rules.view' },
);
