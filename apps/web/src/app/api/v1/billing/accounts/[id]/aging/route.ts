import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAgingReport } from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/billing/accounts/:id/aging — aging report for account
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractAccountId(request);
    const report = await getAgingReport({ tenantId: ctx.tenantId, billingAccountId: id });
    return NextResponse.json({ data: report });
  },
  { entitlement: 'customers', permission: 'billing.view' },
);
