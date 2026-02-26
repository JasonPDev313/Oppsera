import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerActivity } from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 3]!;
}

// GET /api/v1/customers/:id/profile/activity — customer activity feed
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));
    const activity = await getCustomerActivity({
      tenantId: ctx.tenantId,
      customerId: id,
      cursor,
      limit,
    });
    return NextResponse.json({ data: activity });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
