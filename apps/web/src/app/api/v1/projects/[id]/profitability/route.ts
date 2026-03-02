import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProjectProfitability } from '@oppsera/module-project-costing';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/projects/[id]/profitability → id is parts[parts.length - 2]
    const projectId = parts[parts.length - 2]!;
    const result = await getProjectProfitability(ctx.tenantId, projectId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'project_costing.view' },
);
