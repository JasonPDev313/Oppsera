import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAllWorkflowConfigs } from '@oppsera/core/erp';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const configs = await getAllWorkflowConfigs(ctx.tenantId);
    return NextResponse.json({ data: configs });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);
