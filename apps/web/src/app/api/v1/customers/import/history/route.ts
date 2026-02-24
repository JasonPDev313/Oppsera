import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCustomerImportLogs } from '@oppsera/module-customers/queries/list-customer-import-logs';

// GET /api/v1/customers/import/history
// List past imports with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

    const result = await listCustomerImportLogs({
      tenantId: ctx.tenantId,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
