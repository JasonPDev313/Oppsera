import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerProfile } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/:id/profile — customer profile overview
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const profile = await getCustomerProfile({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: profile });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
