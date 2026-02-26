import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTaggedCustomers } from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/tags/{id}/customers → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/tags/:id/customers
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const { searchParams } = new URL(request.url);
    const result = await getTaggedCustomers({
      tenantId: ctx.tenantId,
      tagId,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);
