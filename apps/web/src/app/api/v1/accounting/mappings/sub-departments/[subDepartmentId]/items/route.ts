import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getItemsBySubDepartment } from '@oppsera/module-accounting';
import { parseLimit } from '@/lib/api-params';

function extractSubDepartmentId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // .../sub-departments/{id}/items → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/accounting/mappings/sub-departments/:id/items — items in sub-department
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const subDepartmentId = extractSubDepartmentId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') || null;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await getItemsBySubDepartment({
      tenantId: ctx.tenantId,
      subDepartmentId,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
