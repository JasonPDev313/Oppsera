import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerPrivilegesExtended } from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/privileges-extended — privileges + stored value summary + discount count
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const data = await getCustomerPrivilegesExtended({
      tenantId: ctx.tenantId,
      customerId,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
