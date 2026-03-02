import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { parseLimit } from '@/lib/api-params';
import { getProjectCostDetail } from '@oppsera/module-project-costing';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/projects/[id]/cost-detail → id is parts[parts.length - 2]
    const projectId = parts[parts.length - 2]!;
    const { searchParams } = new URL(request.url);
    const result = await getProjectCostDetail({
      tenantId: ctx.tenantId,
      projectId,
      taskId: searchParams.get('taskId') ?? undefined,
      accountType: searchParams.get('accountType') ?? undefined,
      fromDate: searchParams.get('fromDate') ?? undefined,
      toDate: searchParams.get('toDate') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.items,
      meta: {
        cursor: result.cursor,
        hasMore: result.hasMore,
        totals: result.totals,
      },
    });
  },
  { entitlement: 'accounting', permission: 'project_costing.view' },
);
