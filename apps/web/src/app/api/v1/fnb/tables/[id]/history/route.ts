import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listTableStatusHistory } from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/fnb/tables/:id/history — table status history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tableId = parts[parts.length - 2]!;
    const url = new URL(request.url);

    const result = await listTableStatusHistory({
      tenantId: ctx.tenantId,
      tableId,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);
