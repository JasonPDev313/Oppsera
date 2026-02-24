import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTagAuditLog } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/tags/{id}/audit → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/tags/:id/audit
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const { searchParams } = new URL(request.url);
    const result = await getTagAuditLog({
      tenantId: ctx.tenantId,
      tagId,
      action: searchParams.get('action') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);
