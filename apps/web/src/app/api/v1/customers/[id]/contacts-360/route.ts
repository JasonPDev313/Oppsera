import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerContacts360 } from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const contacts = await getCustomerContacts360({ tenantId: ctx.tenantId, customerId });
    return NextResponse.json({ data: contacts });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
