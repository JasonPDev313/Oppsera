import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerIntegrations } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 3]!;
}

// GET /api/v1/customers/:id/profile/integrations — customer integrations
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const integrations = await getCustomerIntegrations({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: integrations });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
