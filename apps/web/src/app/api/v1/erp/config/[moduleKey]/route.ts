import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getModuleWorkflowConfigs } from '@oppsera/core/erp';

function extractModuleKey(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const moduleKey = extractModuleKey(request);
    const configs = await getModuleWorkflowConfigs(ctx.tenantId, moduleKey);
    return NextResponse.json({ data: configs });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);
