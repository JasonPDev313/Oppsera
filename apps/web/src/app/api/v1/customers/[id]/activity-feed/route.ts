import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerActivityFeed } from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await getCustomerActivityFeed({
      tenantId: ctx.tenantId,
      customerId,
      cursor,
      limit,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
