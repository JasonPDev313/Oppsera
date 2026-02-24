import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { getAccountChangeLog } from '@oppsera/module-accounting';

// GET /api/v1/accounting/accounts/:id/change-log — account change history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.nextUrl.pathname.split('/').at(-2)!;
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10);

    const result = await withTenant(ctx.tenantId, async (tx) => {
      return getAccountChangeLog(tx, ctx.tenantId, accountId, cursor, limit);
    });

    return NextResponse.json({
      data: result.entries,
      meta: { hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
